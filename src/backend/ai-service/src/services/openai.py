# External imports with versions
import openai  # v1.3.0
from tenacity import retry, wait_exponential  # v8.2.3
from typing import Dict, List, Optional, Any  # v3.11
import logging  # v3.11
from prometheus_client import Counter, Histogram  # v0.17.1
import time
from datetime import datetime

# Internal imports
from ..config.settings import Settings

# Configure logging
LOGGER = logging.getLogger(__name__)

# Retry configuration
RETRY_MULTIPLIER = 1
MIN_RETRY_WAIT = 4
MAX_RETRY_WAIT = 60

# Prometheus metrics
API_REQUEST_COUNTER = Counter(
    'openai_api_requests_total',
    'Total OpenAI API requests',
    ['endpoint', 'status']
)
API_LATENCY_HISTOGRAM = Histogram(
    'openai_api_latency_seconds',
    'OpenAI API request latency',
    ['endpoint']
)
TOKEN_USAGE_COUNTER = Counter(
    'openai_token_usage_total',
    'Total tokens used',
    ['model', 'operation']
)

class OpenAIService:
    """
    Enterprise-grade service for OpenAI API interactions with comprehensive monitoring,
    error handling, and retry mechanisms.
    """

    def __init__(self, settings: Settings):
        """
        Initialize OpenAI service with configuration and monitoring setup.

        Args:
            settings (Settings): Application settings instance
        """
        # Get LLM configuration
        llm_config = settings.get_llm_config()
        
        # Configure OpenAI client
        self._api_key = llm_config['api_key']
        self._org_id = llm_config['org_id']
        openai.api_key = self._api_key
        openai.organization = self._org_id

        # Set default parameters
        self._default_model = llm_config['model']
        self._default_temperature = llm_config['temperature']
        self._default_max_tokens = llm_config['max_tokens']
        self._embedding_model = settings.embedding_model

        # Initialize model configurations
        self._model_configs = {
            'gpt-4': {'max_tokens': 8192, 'timeout': 60},
            'gpt-3.5-turbo': {'max_tokens': 4096, 'timeout': 30},
            'text-embedding-ada-002': {'max_tokens': 8191, 'timeout': 15}
        }

        # Initialize rate limiters per model
        self._rate_limiters = {}
        
        LOGGER.info(
            "OpenAI service initialized",
            extra={
                "default_model": self._default_model,
                "embedding_model": self._embedding_model,
                "gpu_config": llm_config.get('gpu_config', {})
            }
        )

    @retry(wait=wait_exponential(multiplier=RETRY_MULTIPLIER, min=MIN_RETRY_WAIT, max=MAX_RETRY_WAIT))
    @API_LATENCY_HISTOGRAM.time()
    async def create_completion(
        self,
        prompt: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        model: Optional[str] = None,
        additional_params: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate text completion with comprehensive error handling and monitoring.

        Args:
            prompt (str): Input text prompt
            temperature (Optional[float]): Sampling temperature
            max_tokens (Optional[int]): Maximum tokens to generate
            model (Optional[str]): Model to use for completion
            additional_params (Optional[Dict[str, Any]]): Additional API parameters

        Returns:
            str: Generated text completion

        Raises:
            ValueError: For invalid input parameters
            openai.error.OpenAIError: For API-specific errors
        """
        start_time = time.time()
        
        # Parameter validation
        if not prompt:
            raise ValueError("Prompt cannot be empty")
        
        model = model or self._default_model
        if model not in self._model_configs:
            raise ValueError(f"Unsupported model: {model}")

        # Prepare parameters
        params = {
            "model": model,
            "temperature": temperature or self._default_temperature,
            "max_tokens": max_tokens or self._default_max_tokens,
            **additional_params or {}
        }

        try:
            # Increment request counter
            API_REQUEST_COUNTER.labels(endpoint='completions', status='attempt').inc()

            # Make API call
            response = await openai.Completion.acreate(
                prompt=prompt,
                **params
            )

            # Track token usage
            if 'usage' in response:
                TOKEN_USAGE_COUNTER.labels(
                    model=model,
                    operation='completion'
                ).inc(response['usage']['total_tokens'])

            # Log success metrics
            API_REQUEST_COUNTER.labels(endpoint='completions', status='success').inc()
            
            LOGGER.info(
                "Completion generated successfully",
                extra={
                    "model": model,
                    "tokens_used": response.get('usage', {}).get('total_tokens'),
                    "latency": time.time() - start_time
                }
            )

            return response.choices[0].text.strip()

        except openai.error.RateLimitError as e:
            API_REQUEST_COUNTER.labels(endpoint='completions', status='rate_limit').inc()
            LOGGER.warning(f"Rate limit exceeded: {str(e)}", extra={"model": model})
            raise

        except openai.error.InvalidRequestError as e:
            API_REQUEST_COUNTER.labels(endpoint='completions', status='invalid_request').inc()
            LOGGER.error(f"Invalid request: {str(e)}", extra={"model": model})
            raise ValueError(f"Invalid request: {str(e)}")

        except openai.error.OpenAIError as e:
            API_REQUEST_COUNTER.labels(endpoint='completions', status='error').inc()
            LOGGER.error(f"OpenAI API error: {str(e)}", extra={"model": model})
            raise

    @retry(wait=wait_exponential(multiplier=RETRY_MULTIPLIER, min=MIN_RETRY_WAIT, max=MAX_RETRY_WAIT))
    @API_LATENCY_HISTOGRAM.time()
    async def create_chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        model: Optional[str] = None,
        additional_params: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate chat completion with monitoring and error handling.

        Args:
            messages (List[Dict[str, str]]): List of message dictionaries
            temperature (Optional[float]): Sampling temperature
            max_tokens (Optional[int]): Maximum tokens to generate
            model (Optional[str]): Model to use for chat completion
            additional_params (Optional[Dict[str, Any]]): Additional API parameters

        Returns:
            str: Generated chat response

        Raises:
            ValueError: For invalid input parameters
            openai.error.OpenAIError: For API-specific errors
        """
        start_time = time.time()

        # Validate messages
        if not messages or not isinstance(messages, list):
            raise ValueError("Messages must be a non-empty list")

        model = model or self._default_model
        if model not in self._model_configs:
            raise ValueError(f"Unsupported model: {model}")

        # Prepare parameters
        params = {
            "model": model,
            "temperature": temperature or self._default_temperature,
            "max_tokens": max_tokens or self._default_max_tokens,
            **additional_params or {}
        }

        try:
            # Increment request counter
            API_REQUEST_COUNTER.labels(endpoint='chat_completions', status='attempt').inc()

            # Make API call
            response = await openai.ChatCompletion.acreate(
                messages=messages,
                **params
            )

            # Track token usage
            if 'usage' in response:
                TOKEN_USAGE_COUNTER.labels(
                    model=model,
                    operation='chat'
                ).inc(response['usage']['total_tokens'])

            # Log success metrics
            API_REQUEST_COUNTER.labels(endpoint='chat_completions', status='success').inc()
            
            LOGGER.info(
                "Chat completion generated successfully",
                extra={
                    "model": model,
                    "tokens_used": response.get('usage', {}).get('total_tokens'),
                    "latency": time.time() - start_time
                }
            )

            return response.choices[0].message.content.strip()

        except openai.error.RateLimitError as e:
            API_REQUEST_COUNTER.labels(endpoint='chat_completions', status='rate_limit').inc()
            LOGGER.warning(f"Rate limit exceeded: {str(e)}", extra={"model": model})
            raise

        except openai.error.InvalidRequestError as e:
            API_REQUEST_COUNTER.labels(endpoint='chat_completions', status='invalid_request').inc()
            LOGGER.error(f"Invalid request: {str(e)}", extra={"model": model})
            raise ValueError(f"Invalid request: {str(e)}")

        except openai.error.OpenAIError as e:
            API_REQUEST_COUNTER.labels(endpoint='chat_completions', status='error').inc()
            LOGGER.error(f"OpenAI API error: {str(e)}", extra={"model": model})
            raise

    @retry(wait=wait_exponential(multiplier=RETRY_MULTIPLIER, min=MIN_RETRY_WAIT, max=MAX_RETRY_WAIT))
    @API_LATENCY_HISTOGRAM.time()
    async def create_embedding(
        self,
        text: str,
        model: Optional[str] = None
    ) -> List[float]:
        """
        Generate embedding vector for input text with monitoring.

        Args:
            text (str): Input text for embedding
            model (Optional[str]): Model to use for embedding generation

        Returns:
            List[float]: Generated embedding vector

        Raises:
            ValueError: For invalid input parameters
            openai.error.OpenAIError: For API-specific errors
        """
        start_time = time.time()

        # Validate input
        if not text:
            raise ValueError("Text cannot be empty")

        model = model or self._embedding_model
        if model not in self._model_configs:
            raise ValueError(f"Unsupported embedding model: {model}")

        try:
            # Increment request counter
            API_REQUEST_COUNTER.labels(endpoint='embeddings', status='attempt').inc()

            # Make API call
            response = await openai.Embedding.acreate(
                input=text,
                model=model
            )

            # Track token usage
            if 'usage' in response:
                TOKEN_USAGE_COUNTER.labels(
                    model=model,
                    operation='embedding'
                ).inc(response['usage']['total_tokens'])

            # Log success metrics
            API_REQUEST_COUNTER.labels(endpoint='embeddings', status='success').inc()
            
            LOGGER.info(
                "Embedding generated successfully",
                extra={
                    "model": model,
                    "tokens_used": response.get('usage', {}).get('total_tokens'),
                    "latency": time.time() - start_time
                }
            )

            return response.data[0].embedding

        except openai.error.RateLimitError as e:
            API_REQUEST_COUNTER.labels(endpoint='embeddings', status='rate_limit').inc()
            LOGGER.warning(f"Rate limit exceeded: {str(e)}", extra={"model": model})
            raise

        except openai.error.InvalidRequestError as e:
            API_REQUEST_COUNTER.labels(endpoint='embeddings', status='invalid_request').inc()
            LOGGER.error(f"Invalid request: {str(e)}", extra={"model": model})
            raise ValueError(f"Invalid request: {str(e)}")

        except openai.error.OpenAIError as e:
            API_REQUEST_COUNTER.labels(endpoint='embeddings', status='error').inc()
            LOGGER.error(f"OpenAI API error: {str(e)}", extra={"model": model})
            raise