# External imports with versions
from fastapi import APIRouter, HTTPException, Security, Depends  # v0.104.0
from fastapi.responses import JSONResponse  # v0.104.0
from fastapi.security import OAuth2AuthorizationCodeBearer  # v0.104.0
from pydantic import BaseModel, Field, validator  # v2.4.2
from typing import Dict, List, Any, Optional  # v3.11
import logging  # v3.11
from datetime import datetime
from opentelemetry import trace  # v1.20.0
from opentelemetry.trace import Status, StatusCode
from prometheus_client import Counter, Histogram  # v0.17.1
from fastapi_limiter import FastAPILimiter  # v0.1.5
from fastapi_limiter.depends import RateLimiter

# Internal imports
from ..core.agent import Agent
from ..config.settings import Settings

# Configure logging
logger = logging.getLogger(__name__)

# Initialize tracer
tracer = trace.get_tracer(__name__)

# Initialize router with prefix and tags
router = APIRouter(prefix="/api/v1/agent", tags=["agent"])

# Initialize OAuth2 scheme
oauth2_scheme = OAuth2AuthorizationCodeBearer(
    authorizationUrl="auth/authorize",
    tokenUrl="auth/token"
)

# Prometheus metrics
AGENT_REQUEST_COUNTER = Counter(
    'agent_api_requests_total',
    'Total number of agent API requests',
    ['endpoint', 'status']
)

AGENT_LATENCY = Histogram(
    'agent_api_latency_seconds',
    'Agent API request latency',
    ['endpoint']
)

# Request/Response Models
class ProcessRequestModel(BaseModel):
    """Enhanced Pydantic model for agent request processing with security context"""
    request: str = Field(..., description="User request text")
    context: Dict[str, Any] = Field(default_factory=dict, description="Request context")
    correlation_id: str = Field(..., description="Unique request identifier")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")

    @validator('request')
    def validate_request(cls, v):
        if not v or not v.strip():
            raise ValueError("Request cannot be empty")
        if len(v) > 10000:  # Security limit
            raise ValueError("Request exceeds maximum length")
        return v.strip()

class ExecuteSkillModel(BaseModel):
    """Enhanced Pydantic model for skill execution with validation"""
    skill_name: str = Field(..., description="Name of skill to execute")
    inputs: Dict[str, Any] = Field(..., description="Skill input parameters")
    execution_context: Optional[Dict[str, Any]] = Field(default=None, description="Execution context")

    @validator('skill_name')
    def validate_skill_name(cls, v):
        if not v or not v.strip():
            raise ValueError("Skill name cannot be empty")
        return v.strip()

# Dependency for getting settings
async def get_settings():
    return Settings()

# Route handlers
@router.post('/process')
@tracer.start_as_current_span("process_request")
async def process_request(
    request_data: ProcessRequestModel,
    settings: Settings = Depends(get_settings),
    token: str = Security(oauth2_scheme),
    rate_limit: Any = Depends(RateLimiter(times=100, seconds=60))
) -> JSONResponse:
    """
    Process an agent request with enhanced security and monitoring.
    
    Args:
        request_data (ProcessRequestModel): Request data model
        settings (Settings): Application settings
        token (str): OAuth2 token
        rate_limit (Any): Rate limiter dependency
        
    Returns:
        JSONResponse: Processing results with response and artifacts
    """
    start_time = datetime.now()
    
    try:
        # Start monitoring span
        with tracer.start_as_current_span("process_request") as span:
            span.set_attribute("correlation_id", request_data.correlation_id)
            
            # Initialize agent with secure settings
            agent = Agent(settings)
            
            # Process request with security context
            response = await agent.process_request(
                request=request_data.request,
                context=request_data.context,
                security_context={
                    "token": token,
                    "correlation_id": request_data.correlation_id,
                    "timestamp": datetime.now().isoformat()
                }
            )
            
            # Record success metrics
            duration = (datetime.now() - start_time).total_seconds()
            AGENT_REQUEST_COUNTER.labels(
                endpoint="process_request",
                status="success"
            ).inc()
            AGENT_LATENCY.labels(
                endpoint="process_request"
            ).observe(duration)
            
            logger.info(
                "Request processed successfully",
                extra={
                    "correlation_id": request_data.correlation_id,
                    "duration": duration
                }
            )
            
            return JSONResponse(
                status_code=200,
                content={
                    "status": "success",
                    "data": response,
                    "metadata": {
                        "correlation_id": request_data.correlation_id,
                        "processing_time": duration
                    }
                }
            )
            
    except Exception as e:
        # Record error metrics
        AGENT_REQUEST_COUNTER.labels(
            endpoint="process_request",
            status="error"
        ).inc()
        
        logger.error(
            f"Request processing failed: {str(e)}",
            extra={"correlation_id": request_data.correlation_id}
        )
        
        raise HTTPException(
            status_code=500,
            detail=f"Request processing failed: {str(e)}"
        )

@router.post('/skill/execute')
@tracer.start_as_current_span("execute_skill")
async def execute_skill(
    skill_data: ExecuteSkillModel,
    settings: Settings = Depends(get_settings),
    token: str = Security(oauth2_scheme),
    rate_limit: Any = Depends(RateLimiter(times=60, seconds=60))
) -> JSONResponse:
    """
    Execute a specific skill with security validation.
    
    Args:
        skill_data (ExecuteSkillModel): Skill execution data
        settings (Settings): Application settings
        token (str): OAuth2 token
        rate_limit (Any): Rate limiter dependency
        
    Returns:
        JSONResponse: Skill execution results
    """
    start_time = datetime.now()
    
    try:
        # Initialize agent with secure settings
        agent = Agent(settings)
        
        # Execute skill with monitoring
        result = await agent.execute_skill(
            skill_name=skill_data.skill_name,
            inputs=skill_data.inputs,
            execution_context=skill_data.execution_context
        )
        
        # Record success metrics
        duration = (datetime.now() - start_time).total_seconds()
        AGENT_REQUEST_COUNTER.labels(
            endpoint="execute_skill",
            status="success"
        ).inc()
        AGENT_LATENCY.labels(
            endpoint="execute_skill"
        ).observe(duration)
        
        logger.info(
            f"Skill {skill_data.skill_name} executed successfully",
            extra={"duration": duration}
        )
        
        return JSONResponse(
            status_code=200,
            content={
                "status": "success",
                "data": result,
                "metadata": {
                    "skill_name": skill_data.skill_name,
                    "execution_time": duration
                }
            }
        )
        
    except Exception as e:
        # Record error metrics
        AGENT_REQUEST_COUNTER.labels(
            endpoint="execute_skill",
            status="error"
        ).inc()
        
        logger.error(f"Skill execution failed: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Skill execution failed: {str(e)}"
        )

@router.get('/skills')
@tracer.start_as_current_span("get_skills")
async def get_skills(
    settings: Settings = Depends(get_settings),
    token: str = Security(oauth2_scheme),
    rate_limit: Any = Depends(RateLimiter(times=300, seconds=60))
) -> JSONResponse:
    """
    Get list of available agent skills with security filtering.
    
    Args:
        settings (Settings): Application settings
        token (str): OAuth2 token
        rate_limit (Any): Rate limiter dependency
        
    Returns:
        JSONResponse: Filtered list of available skills and metadata
    """
    try:
        # Initialize agent
        agent = Agent(settings)
        
        # Get skills with security context
        skills = await agent._skill_registry.list_skills()
        
        # Filter sensitive information
        filtered_skills = [
            {
                "name": skill.name,
                "description": skill.description,
                "category": skill.category,
                "metadata": {
                    k: v for k, v in skill.metadata.items()
                    if k not in ["security_config", "error_counts"]
                }
            }
            for skill in skills
        ]
        
        # Record metrics
        AGENT_REQUEST_COUNTER.labels(
            endpoint="get_skills",
            status="success"
        ).inc()
        
        return JSONResponse(
            status_code=200,
            content={
                "status": "success",
                "data": filtered_skills,
                "metadata": {
                    "total_skills": len(filtered_skills),
                    "timestamp": datetime.now().isoformat()
                }
            }
        )
        
    except Exception as e:
        # Record error metrics
        AGENT_REQUEST_COUNTER.labels(
            endpoint="get_skills",
            status="error"
        ).inc()
        
        logger.error(f"Failed to retrieve skills: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve skills: {str(e)}"
        )