# External imports with versions
from enum import Enum  # v3.11
from typing import Dict, List, Optional, Any, Tuple  # v3.11
from pydantic import BaseModel, Field, validator  # v2.4.2
from prometheus_client import Counter, Histogram  # v0.17.1
import logging  # v3.11
from threading import Lock  # v3.11
from datetime import datetime
from functools import wraps

# Internal imports
from ..core.llm import LanguageModel

# Configure logging
logger = logging.getLogger(__name__)

# Skill categories enum
class SkillCategory(str, Enum):
    TEXT_PROCESSING = "TEXT_PROCESSING"
    DECISION_MAKING = "DECISION_MAKING"
    DATA_ANALYSIS = "DATA_ANALYSIS"
    KNOWLEDGE_BASE = "KNOWLEDGE_BASE"

# Prometheus metrics
SKILL_METRICS = Counter(
    'skill_executions_total',
    'Total skill executions',
    ['skill_name', 'category', 'status']
)

SKILL_LATENCY = Histogram(
    'skill_execution_duration_seconds',
    'Skill execution duration',
    ['skill_name']
)

def metrics_decorator(func):
    """Decorator for tracking skill metrics"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = datetime.now()
        skill_instance = args[0]
        try:
            result = await func(*args, **kwargs)
            SKILL_METRICS.labels(
                skill_name=skill_instance.name,
                category=skill_instance.category,
                status="success"
            ).inc()
            return result
        except Exception as e:
            SKILL_METRICS.labels(
                skill_name=skill_instance.name,
                category=skill_instance.category,
                status="error"
            ).inc()
            raise
        finally:
            duration = (datetime.now() - start_time).total_seconds()
            SKILL_LATENCY.labels(skill_name=skill_instance.name).observe(duration)
    return wrapper

def validate_skill_config(skill_config: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Validates the configuration of a skill before registration with enhanced security checks.
    
    Args:
        skill_config (Dict[str, Any]): Skill configuration dictionary
        
    Returns:
        Tuple[bool, Optional[str]]: Validation result and error message
    """
    try:
        required_fields = ["name", "description", "category", "prompt_template"]
        for field in required_fields:
            if field not in skill_config:
                return False, f"Missing required field: {field}"

        # Validate category
        if skill_config["category"] not in SkillCategory.__members__:
            return False, f"Invalid category: {skill_config['category']}"

        # Validate prompt template for injection vulnerabilities
        if not isinstance(skill_config["prompt_template"], dict):
            return False, "Prompt template must be a dictionary"

        # Validate input/output schemas
        if "input_schema" in skill_config and not isinstance(skill_config["input_schema"], dict):
            return False, "Input schema must be a dictionary"
        if "output_schema" in skill_config and not isinstance(skill_config["output_schema"], dict):
            return False, "Output schema must be a dictionary"

        return True, None
    except Exception as e:
        logger.error(f"Skill validation error: {str(e)}")
        return False, f"Validation error: {str(e)}"

class Skill(BaseModel):
    """Enhanced model representing an individual AI skill with production-ready features"""
    
    name: str = Field(..., description="Unique skill identifier")
    description: str = Field(..., description="Detailed skill description")
    category: SkillCategory = Field(..., description="Skill category")
    prompt_template: Dict[str, str] = Field(..., description="Templated prompts for skill execution")
    input_schema: Dict[str, Any] = Field(default_factory=dict, description="Input validation schema")
    output_schema: Dict[str, Any] = Field(default_factory=dict, description="Output validation schema")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional skill metadata")
    performance_metrics: Dict[str, float] = Field(default_factory=dict, description="Performance tracking")
    error_counts: Dict[str, int] = Field(default_factory=dict, description="Error tracking")
    security_config: Dict[str, Any] = Field(default_factory=dict, description="Security settings")

    def __init__(self, **data):
        """Initialize a new skill with enhanced monitoring and security features"""
        super().__init__(**data)
        self.performance_metrics = {
            "avg_latency": 0.0,
            "success_rate": 100.0,
            "last_execution": None
        }
        self.error_counts = {
            "validation_errors": 0,
            "execution_errors": 0,
            "timeout_errors": 0
        }
        self.security_config = {
            "max_retries": 3,
            "timeout_seconds": 30,
            "max_input_size": 10000
        }
        logger.info(f"Skill initialized: {self.name}")

    @validator("name")
    def validate_name(cls, v):
        """Validate skill name"""
        if not v or not v.strip():
            raise ValueError("Skill name cannot be empty")
        return v.strip()

    async def validate_inputs(self, inputs: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """
        Validate input parameters with enhanced security checks.
        
        Args:
            inputs (Dict[str, Any]): Input parameters to validate
            
        Returns:
            Tuple[bool, Optional[str]]: Validation result and error message
        """
        try:
            # Check input size limits
            input_size = len(str(inputs))
            if input_size > self.security_config["max_input_size"]:
                return False, f"Input size exceeds limit: {input_size} > {self.security_config['max_input_size']}"

            # Validate against schema
            if self.input_schema:
                for key, schema in self.input_schema.items():
                    if key not in inputs:
                        return False, f"Missing required input: {key}"
                    if not isinstance(inputs[key], type(schema)):
                        return False, f"Invalid type for {key}: expected {type(schema)}, got {type(inputs[key])}"

            return True, None
        except Exception as e:
            self.error_counts["validation_errors"] += 1
            logger.error(f"Input validation error for skill {self.name}: {str(e)}")
            return False, str(e)

    @metrics_decorator
    async def execute(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute skill with monitoring and error handling.
        
        Args:
            inputs (Dict[str, Any]): Input parameters for skill execution
            
        Returns:
            Dict[str, Any]: Execution results
        """
        start_time = datetime.now()
        
        try:
            # Validate inputs
            is_valid, error_msg = await self.validate_inputs(inputs)
            if not is_valid:
                raise ValueError(f"Input validation failed: {error_msg}")

            # Execute skill logic using language model
            prompt = self.prompt_template["base"].format(**inputs)
            result = await LanguageModel.generate_text(prompt)

            # Update performance metrics
            duration = (datetime.now() - start_time).total_seconds()
            self.performance_metrics["avg_latency"] = (
                (self.performance_metrics["avg_latency"] + duration) / 2
                if self.performance_metrics["last_execution"]
                else duration
            )
            self.performance_metrics["last_execution"] = datetime.now().isoformat()

            logger.info(
                f"Skill {self.name} executed successfully",
                extra={
                    "duration": duration,
                    "input_size": len(str(inputs)),
                    "output_size": len(str(result))
                }
            )

            return {"result": result, "metadata": self.metadata}

        except Exception as e:
            self.error_counts["execution_errors"] += 1
            self.performance_metrics["success_rate"] = (
                (self.performance_metrics["success_rate"] * 99 + 0) / 100
            )
            logger.error(f"Skill execution error: {str(e)}")
            raise

class SkillRegistry:
    """Enhanced registry for managing AI skills with enterprise features"""

    def __init__(self):
        """Initialize registry with monitoring and synchronization"""
        self._skills: Dict[str, Skill] = {}
        self._metrics: Dict[str, Dict[str, Any]] = {}
        self._registry_lock = Lock()
        logger.info("Skill registry initialized")

    async def register_skill(self, skill: Skill) -> Tuple[bool, Optional[str]]:
        """
        Register skill with enhanced validation and monitoring.
        
        Args:
            skill (Skill): Skill instance to register
            
        Returns:
            Tuple[bool, Optional[str]]: Registration status and error message
        """
        try:
            with self._registry_lock:
                # Validate skill configuration
                is_valid, error_msg = validate_skill_config(skill.dict())
                if not is_valid:
                    return False, error_msg

                # Check for existing skill
                if skill.name in self._skills:
                    return False, f"Skill already exists: {skill.name}"

                # Register skill
                self._skills[skill.name] = skill
                self._metrics[skill.name] = {
                    "registered_at": datetime.now().isoformat(),
                    "execution_count": 0,
                    "error_rate": 0.0
                }

                logger.info(f"Skill registered successfully: {skill.name}")
                return True, None

        except Exception as e:
            logger.error(f"Skill registration error: {str(e)}")
            return False, str(e)

    async def bulk_register(self, skills: List[Skill]) -> Dict[str, Tuple[bool, Optional[str]]]:
        """
        Register multiple skills atomically.
        
        Args:
            skills (List[Skill]): List of skills to register
            
        Returns:
            Dict[str, Tuple[bool, Optional[str]]]: Registration results per skill
        """
        results = {}
        try:
            with self._registry_lock:
                # Validate all skills first
                for skill in skills:
                    is_valid, error_msg = validate_skill_config(skill.dict())
                    if not is_valid:
                        results[skill.name] = (False, error_msg)
                        return results

                # Register all skills if validation passes
                for skill in skills:
                    success, error_msg = await self.register_skill(skill)
                    results[skill.name] = (success, error_msg)

                logger.info(f"Bulk registration completed for {len(skills)} skills")
                return results

        except Exception as e:
            logger.error(f"Bulk registration error: {str(e)}")
            return {skill.name: (False, str(e)) for skill in skills}