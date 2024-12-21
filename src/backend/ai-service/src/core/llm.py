# External imports with versions
from typing import Dict, List, Optional, Any  # v3.11
from pydantic import BaseModel, validator  # v2.4.2
from tenacity import retry, wait_exponential, stop_after_attempt  # v8.2.3
import logging  # v3.11
from prometheus_client import Counter, Histogram  # v0.17.1
from opentelemetry import trace  # v1.20.0
from opentelemetry.trace import Status, StatusCode
import functools
from datetime import datetime
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Internal imports
from ..services.openai import OpenAIService
from ..config.settings import Settings

# Configure logging
logger = logging.getLogger(__name__)

# Constants
DEFAULT_TEMPERATURE = 0.7
DEFAULT_MAX_TOKENS = 1000

# Prometheus metrics
LLM_REQUEST_DURATION = Histogram(
    'llm_request_duration_seconds',
    'Duration of LLM requests',
    ['operation']
)
LLM_REQUEST_FAILURES = Counter(
    'llm_request_failures_total',
    'Total number of LLM request failures',
    ['operation', 'error_type']
)

# Initialize tracer
tracer = trace.get_tracer(__name__)

class LLMRequest(BaseModel):
    """Validation model for LLM requests"""
    prompt: str
    temperature: Optional[float] = DEFAULT_TEMPERATURE
    max_tokens: Optional[int] = DEFAULT_MAX_TOKENS
    request_id: Optional[str] = None

    @validator('prompt')
    def validate_prompt(cls, v):
        if not v or not v.strip():
            raise ValueError("Prompt cannot be empty")
        return v.strip()

    @validator('temperature')
    def validate_temperature(cls, v):
        if v is not None and not (0 <= v <= 1):
            raise ValueError("Temperature must be between 0 and 1")
        return v

    @validator('max_tokens')
    def validate_max_tokens(cls, v):
        if v is not None and v < 1:
            raise ValueError("Max tokens must be positive")
        return v

def trace_method(name: str):
    """Decorator for OpenTelemetry tracing"""
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            with tracer.start_as_current_span(name) as span:
                try:
                    result = await func(*args, **kwargs)
                    span.set_status(Status(StatusCode.OK))
                    return result
                except Exception as e:
                    span.set_status(Status(StatusCode.ERROR, str(e)))
                    raise
        return wrapper
    return decorator

class LanguageModel:
    """
    High-level interface for language model operations with enhanced production features
    including monitoring, error handling, and resource management.
    """

    def __init__(self, settings: Settings):
        """
        Initialize language model with configuration settings and monitoring.

        Args:
            settings (Settings): Application settings instance
        """
        self._settings = settings
        self._openai_service = OpenAIService(settings)
        self._model_config = settings.get_llm_config()
        
        # Initialize thread pool for concurrent operations
        self._thread_pool = ThreadPoolExecutor(
            max_workers=self._model_config.get('max_concurrent_requests', 10)
        )
        
        # Configure resource limits
        self._rate_limiter = asyncio.Semaphore(
            self._model_config.get('max_concurrent_requests', 10)
        )
        
        logger.info(
            "Language model initialized",
            extra={
                "model": self._model_config['model'],
                "gpu_config": self._model_config.get('gpu_config', {})
            }
        )

    async def __aenter__(self):
        """Async context manager entry"""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit with cleanup"""
        await self.cleanup()

    async def cleanup(self):
        """Cleanup resources"""
        self._thread_pool.shutdown(wait=True)
        logger.info("Language model resources cleaned up")

    @retry(
        wait=wait_exponential(multiplier=1, min=4, max=60),
        stop=stop_after_attempt(3)
    )
    @trace_method("generate_text")
    async def generate_text(
        self,
        prompt: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        request_id: Optional[str] = None
    ) -> str:
        """
        Generate text completion using configured language model with enhanced monitoring.

        Args:
            prompt (str): Input text prompt
            temperature (Optional[float]): Sampling temperature
            max_tokens (Optional[int]): Maximum tokens to generate
            request_id (Optional[str]): Unique request identifier

        Returns:
            str: Generated text completion

        Raises:
            ValueError: For invalid input parameters
            RuntimeError: For service-level errors
        """
        start_time = datetime.now()

        try:
            # Validate request parameters
            request = LLMRequest(
                prompt=prompt,
                temperature=temperature,
                max_tokens=max_tokens,
                request_id=request_id
            )

            # Acquire rate limiter
            async with self._rate_limiter:
                # Generate completion with metrics
                with LLM_REQUEST_DURATION.labels(operation='generate_text').time():
                    completion = await self._openai_service.create_completion(
                        prompt=request.prompt,
                        temperature=request.temperature,
                        max_tokens=request.max_tokens,
                        model=self._model_config['model']
                    )

                logger.info(
                    "Text generation completed",
                    extra={
                        "request_id": request.request_id,
                        "duration_ms": (datetime.now() - start_time).total_seconds() * 1000,
                        "prompt_length": len(request.prompt),
                        "completion_length": len(completion)
                    }
                )

                return completion

        except ValueError as e:
            LLM_REQUEST_FAILURES.labels(
                operation='generate_text',
                error_type='validation_error'
            ).inc()
            logger.error(
                "Validation error in text generation",
                extra={
                    "request_id": request_id,
                    "error": str(e)
                }
            )
            raise

        except Exception as e:
            LLM_REQUEST_FAILURES.labels(
                operation='generate_text',
                error_type='service_error'
            ).inc()
            logger.error(
                "Error in text generation",
                extra={
                    "request_id": request_id,
                    "error": str(e)
                }
            )
            raise RuntimeError(f"Text generation failed: {str(e)}")

    @trace_method("get_embedding")
    async def get_embedding(self, text: str) -> List[float]:
        """
        Generate embedding vector for input text with monitoring.

        Args:
            text (str): Input text for embedding

        Returns:
            List[float]: Generated embedding vector

        Raises:
            ValueError: For invalid input
            RuntimeError: For service-level errors
        """
        start_time = datetime.now()

        try:
            if not text.strip():
                raise ValueError("Input text cannot be empty")

            with LLM_REQUEST_DURATION.labels(operation='get_embedding').time():
                embedding = await self._openai_service.create_embedding(
                    text=text,
                    model=self._settings.embedding_model
                )

            logger.info(
                "Embedding generation completed",
                extra={
                    "duration_ms": (datetime.now() - start_time).total_seconds() * 1000,
                    "text_length": len(text),
                    "embedding_dimension": len(embedding)
                }
            )

            return embedding

        except Exception as e:
            LLM_REQUEST_FAILURES.labels(
                operation='get_embedding',
                error_type='service_error'
            ).inc()
            logger.error(
                "Error in embedding generation",
                extra={"error": str(e)}
            )
            raise RuntimeError(f"Embedding generation failed: {str(e)}")