# External imports with versions
from pydantic import dataclasses  # v2.4.2
from typing import Dict, List, Any, Optional  # v3.11
import logging  # v3.11
import asyncio  # v3.11
from tenacity import retry, wait_exponential, stop_after_attempt  # v8.2.3
from opentelemetry import trace  # v1.20.0
from opentelemetry.trace import Status, StatusCode
from prometheus_client import Counter, Histogram  # v0.17.1
from datetime import datetime
from circuitbreaker import circuit

# Internal imports
from .llm import LanguageModel
from .embeddings import EmbeddingService
from ..models.skills import Skill, SkillRegistry
from ..config.settings import Settings

# Configure logging
LOGGER = logging.getLogger(__name__)

# Constants
MAX_CONTEXT_LENGTH = 4096
MAX_SKILL_RETRIES = 3
CONVERSATION_HISTORY_LIMIT = 100
STATE_CLEANUP_INTERVAL = 3600
METRICS_REPORTING_INTERVAL = 60

# Prometheus metrics
AGENT_REQUEST_COUNTER = Counter(
    'agent_requests_total',
    'Total number of agent requests',
    ['operation', 'status']
)

AGENT_LATENCY = Histogram(
    'agent_request_duration_seconds',
    'Agent request duration',
    ['operation']
)

# Initialize tracer
tracer = trace.get_tracer(__name__)

@dataclasses.dataclass
@trace.instrument_class
class Agent:
    """
    Enterprise-grade AI agent class that orchestrates language model, embeddings,
    and skills with comprehensive security, monitoring, and reliability features.
    """

    def __init__(self, settings: Settings):
        """
        Initialize AI agent with required services, configuration, and monitoring.

        Args:
            settings (Settings): Application configuration instance
        """
        self._settings = settings
        self._llm = LanguageModel(settings)
        self._embedding_service = EmbeddingService(settings)
        self._skill_registry = SkillRegistry()
        
        # Initialize state management
        self._state: Dict[str, Any] = {}
        self._conversation_history: List[Dict[str, Any]] = []
        
        # Configure circuit breaker
        self._circuit_breaker = circuit(
            failure_threshold=3,
            recovery_timeout=60,
            name='agent_circuit_breaker'
        )
        
        # Start background tasks
        asyncio.create_task(self._cleanup_state())
        asyncio.create_task(self._report_metrics())
        
        LOGGER.info(
            "AI Agent initialized successfully",
            extra={
                "llm_config": settings.get_llm_config(),
                "security_enabled": True
            }
        )

    @retry(
        wait=wait_exponential(multiplier=1, min=4, max=60),
        stop=stop_after_attempt(3)
    )
    @trace.span
    async def process_request(
        self,
        request: str,
        context: Optional[Dict[str, Any]] = None,
        security_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Process user request with comprehensive security, monitoring, and reliability features.

        Args:
            request (str): User request text
            context (Optional[Dict[str, Any]]): Additional context for request processing
            security_context (Optional[Dict[str, Any]]): Security validation context

        Returns:
            Dict[str, Any]: Processing results with execution metrics

        Raises:
            ValueError: For invalid inputs
            RuntimeError: For processing failures
        """
        start_time = datetime.now()
        
        try:
            # Validate and sanitize input
            if not request or not isinstance(request, str):
                raise ValueError("Invalid request format")
            
            # Security validation
            if security_context:
                self._validate_security_context(security_context)
            
            # Start monitoring span
            with tracer.start_as_current_span("process_request") as span:
                span.set_attribute("request_length", len(request))
                
                # Update conversation history
                await self._update_conversation_history(request, context)
                
                # Generate request embedding
                request_embedding = await self._embedding_service.generate_embedding(request)
                
                # Get relevant conversation context
                conversation_context = await self.get_conversation_context(
                    request,
                    security_context
                )
                
                # Select appropriate skills
                relevant_skills = await self._select_skills(request_embedding)
                
                # Execute skills with monitoring
                results = []
                for skill in relevant_skills:
                    try:
                        skill_result = await self.execute_skill(
                            skill.name,
                            {
                                "request": request,
                                "context": conversation_context
                            }
                        )
                        results.append(skill_result)
                    except Exception as e:
                        LOGGER.error(f"Skill execution failed: {str(e)}")
                        continue
                
                # Update agent state
                await self.update_state({
                    "last_request": request,
                    "last_results": results,
                    "timestamp": datetime.now().isoformat()
                })
                
                # Prepare response with metrics
                execution_time = (datetime.now() - start_time).total_seconds()
                response = {
                    "results": results,
                    "metrics": {
                        "execution_time": execution_time,
                        "skills_executed": len(results),
                        "timestamp": datetime.now().isoformat()
                    }
                }
                
                # Record metrics
                AGENT_REQUEST_COUNTER.labels(
                    operation='process_request',
                    status='success'
                ).inc()
                AGENT_LATENCY.labels(
                    operation='process_request'
                ).observe(execution_time)
                
                return response

        except Exception as e:
            AGENT_REQUEST_COUNTER.labels(
                operation='process_request',
                status='error'
            ).inc()
            LOGGER.error(f"Request processing failed: {str(e)}")
            raise RuntimeError(f"Failed to process request: {str(e)}")

    @trace.span
    async def execute_skill(
        self,
        skill_name: str,
        inputs: Dict[str, Any],
        execution_context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Execute skill with reliability and monitoring features.

        Args:
            skill_name (str): Name of skill to execute
            inputs (Dict[str, Any]): Skill input parameters
            execution_context (Optional[Dict[str, Any]]): Additional execution context

        Returns:
            Dict[str, Any]: Skill execution results with metrics

        Raises:
            ValueError: For invalid inputs
            RuntimeError: For execution failures
        """
        try:
            # Validate skill access
            skill = await self._skill_registry.get_skill(skill_name)
            if not skill:
                raise ValueError(f"Skill not found: {skill_name}")
            
            # Check circuit breaker
            if self._circuit_breaker.opened:
                raise RuntimeError("Circuit breaker is open")
            
            # Validate inputs
            is_valid, error_msg = await skill.validate_inputs(inputs)
            if not is_valid:
                raise ValueError(f"Invalid inputs: {error_msg}")
            
            # Execute with monitoring
            with AGENT_LATENCY.labels(operation='execute_skill').time():
                result = await skill.execute(inputs)
            
            return result

        except Exception as e:
            LOGGER.error(f"Skill execution failed: {str(e)}")
            raise

    async def update_state(self, new_state: Dict[str, Any]) -> bool:
        """
        Update agent state with validation and cleanup.

        Args:
            new_state (Dict[str, Any]): New state data to merge

        Returns:
            bool: Update success status
        """
        try:
            # Validate state update
            if not isinstance(new_state, dict):
                raise ValueError("Invalid state format")
            
            # Check memory limits
            state_size = len(str(new_state))
            if state_size > MAX_CONTEXT_LENGTH:
                LOGGER.warning("State size exceeds limit, performing cleanup")
                await self._cleanup_state()
            
            # Merge with existing state
            self._state.update(new_state)
            return True

        except Exception as e:
            LOGGER.error(f"State update failed: {str(e)}")
            return False

    async def get_conversation_context(
        self,
        request: str,
        security_context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, str]]:
        """
        Get relevant conversation context with security checks.

        Args:
            request (str): Current request
            security_context (Optional[Dict[str, Any]]): Security validation context

        Returns:
            List[Dict[str, str]]: Filtered conversation history
        """
        try:
            # Security validation
            if security_context:
                self._validate_security_context(security_context)
            
            # Generate request embedding
            request_embedding = await self._embedding_service.generate_embedding(request)
            
            # Search similar conversations
            similar_conversations = await self._embedding_service.search_similar(
                request,
                top_k=5
            )
            
            # Format and return context
            return [
                {
                    "role": conv["metadata"]["role"],
                    "content": conv["metadata"]["content"]
                }
                for conv in similar_conversations
            ]

        except Exception as e:
            LOGGER.error(f"Failed to get conversation context: {str(e)}")
            return []

    async def _cleanup_state(self):
        """Background task for state cleanup"""
        while True:
            try:
                await asyncio.sleep(STATE_CLEANUP_INTERVAL)
                if len(self._conversation_history) > CONVERSATION_HISTORY_LIMIT:
                    self._conversation_history = self._conversation_history[-CONVERSATION_HISTORY_LIMIT:]
                LOGGER.info("State cleanup completed")
            except Exception as e:
                LOGGER.error(f"State cleanup failed: {str(e)}")

    async def _report_metrics(self):
        """Background task for metrics reporting"""
        while True:
            try:
                await asyncio.sleep(METRICS_REPORTING_INTERVAL)
                # Report custom metrics
                LOGGER.info(
                    "Agent metrics",
                    extra={
                        "conversation_history_size": len(self._conversation_history),
                        "state_size": len(str(self._state)),
                        "circuit_breaker_status": "open" if self._circuit_breaker.opened else "closed"
                    }
                )
            except Exception as e:
                LOGGER.error(f"Metrics reporting failed: {str(e)}")

    def _validate_security_context(self, security_context: Dict[str, Any]):
        """Validate security context for request processing"""
        required_fields = ["user_id", "access_level", "timestamp"]
        for field in required_fields:
            if field not in security_context:
                raise ValueError(f"Missing required security field: {field}")
        
        # Validate timestamp freshness
        request_time = datetime.fromisoformat(security_context["timestamp"])
        if (datetime.now() - request_time).total_seconds() > 300:  # 5 minute expiry
            raise ValueError("Security context has expired")

    async def _select_skills(self, request_embedding: List[float]) -> List[Skill]:
        """Select relevant skills based on request embedding"""
        try:
            all_skills = await self._skill_registry.list_skills()
            # TODO: Implement skill selection logic based on embeddings
            return all_skills[:3]  # Return top 3 skills for now
        except Exception as e:
            LOGGER.error(f"Skill selection failed: {str(e)}")
            return []

    async def _update_conversation_history(
        self,
        request: str,
        context: Optional[Dict[str, Any]]
    ):
        """Update conversation history with new request"""
        try:
            self._conversation_history.append({
                "role": "user",
                "content": request,
                "timestamp": datetime.now().isoformat(),
                "context": context or {}
            })
            if len(self._conversation_history) > CONVERSATION_HISTORY_LIMIT:
                self._conversation_history.pop(0)
        except Exception as e:
            LOGGER.error(f"Failed to update conversation history: {str(e)}")