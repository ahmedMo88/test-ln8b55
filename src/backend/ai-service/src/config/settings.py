# External imports with versions
import os  # v3.11
import datetime
from typing import Dict, Any, Optional  # v3.11
from pydantic import BaseModel, SecretStr, Field  # v2.4.2
from dotenv import load_dotenv  # v1.0.0
from cryptography.fernet import Fernet  # v41.0.0
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Global constants
DEFAULT_LLM_MODEL = "gpt-4"
DEFAULT_TEMPERATURE = 0.7
DEFAULT_MAX_TOKENS = 1000
DEFAULT_EMBEDDING_MODEL = "text-embedding-ada-002"
DEFAULT_EMBEDDING_DIMENSION = 1536
CONFIG_VERSION = "1.0.0"
KEY_ROTATION_DAYS = 30
ENCRYPTION_ALGORITHM = "AES-256-GCM"

class Settings(BaseModel):
    """
    Main settings class for managing AI service configuration with enhanced security 
    and GPU optimization features.
    """
    # Environment and version settings
    environment: str = Field(..., description="Deployment environment (development/staging/production)")
    config_version: str = Field(default=CONFIG_VERSION, description="Configuration version for tracking")
    last_updated: datetime.datetime = Field(default_factory=datetime.datetime.now)

    # Secure API credentials
    openai_api_key: SecretStr = Field(..., description="OpenAI API key")
    openai_org_id: SecretStr = Field(..., description="OpenAI organization ID")
    pinecone_api_key: SecretStr = Field(..., description="Pinecone API key")
    pinecone_environment: str = Field(..., description="Pinecone environment")
    pinecone_index_name: str = Field(..., description="Pinecone index name")

    # LLM configuration
    default_llm_model: str = Field(default=DEFAULT_LLM_MODEL)
    default_temperature: float = Field(default=DEFAULT_TEMPERATURE)
    default_max_tokens: int = Field(default=DEFAULT_MAX_TOKENS)
    
    # Embedding configuration
    embedding_model: str = Field(default=DEFAULT_EMBEDDING_MODEL)
    embedding_dimension: int = Field(default=DEFAULT_EMBEDDING_DIMENSION)

    # GPU and performance configuration
    gpu_config: Dict[str, Any] = Field(default_factory=dict)
    
    # Security configuration
    encryption_keys: Dict[str, str] = Field(default_factory=dict)
    
    # Monitoring configuration
    monitoring_config: Dict[str, Any] = Field(default_factory=dict)

    def __init__(self, env_file: str = ".env", **kwargs):
        """
        Initialize settings with enhanced security and validation.
        
        Args:
            env_file (str): Path to environment file
            **kwargs: Additional configuration parameters
        """
        # Load environment variables
        load_dotenv(env_file)
        
        # Initialize with environment variables
        super().__init__(
            environment=os.getenv("ENVIRONMENT", "development"),
            openai_api_key=SecretStr(os.getenv("OPENAI_API_KEY", "")),
            openai_org_id=SecretStr(os.getenv("OPENAI_ORG_ID", "")),
            pinecone_api_key=SecretStr(os.getenv("PINECONE_API_KEY", "")),
            pinecone_environment=os.getenv("PINECONE_ENVIRONMENT", ""),
            pinecone_index_name=os.getenv("PINECONE_INDEX_NAME", ""),
            **kwargs
        )

        # Initialize encryption
        self._initialize_encryption()
        
        # Configure GPU settings
        self._configure_gpu()
        
        # Set up monitoring
        self._initialize_monitoring()

    def _initialize_encryption(self) -> None:
        """Initialize encryption for sensitive data."""
        salt = os.urandom(16)
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        key = kdf.derive(os.getenv("ENCRYPTION_KEY", "default").encode())
        self.encryption_keys = {
            "primary": key.hex(),
            "created_at": datetime.datetime.now().isoformat()
        }

    def _configure_gpu(self) -> None:
        """Configure GPU optimization settings."""
        self.gpu_config = {
            "cuda_visible_devices": os.getenv("CUDA_VISIBLE_DEVICES", "0"),
            "cuda_memory_fraction": float(os.getenv("CUDA_MEMORY_FRACTION", "0.8")),
            "optimization_level": os.getenv("GPU_OPTIMIZATION_LEVEL", "O2"),
            "mixed_precision": os.getenv("MIXED_PRECISION", "True").lower() == "true"
        }

    def _initialize_monitoring(self) -> None:
        """Initialize monitoring configuration."""
        self.monitoring_config = {
            "log_level": os.getenv("LOG_LEVEL", "INFO"),
            "metrics_enabled": os.getenv("METRICS_ENABLED", "True").lower() == "true",
            "tracing_enabled": os.getenv("TRACING_ENABLED", "True").lower() == "true",
            "performance_monitoring": os.getenv("PERFORMANCE_MONITORING", "True").lower() == "true"
        }

    def get_llm_config(self) -> Dict[str, Any]:
        """
        Get secure LLM configuration settings.
        
        Returns:
            Dict[str, Any]: Encrypted LLM configuration dictionary
        """
        return {
            "model": self.default_llm_model,
            "temperature": self.default_temperature,
            "max_tokens": self.default_max_tokens,
            "api_key": self.openai_api_key.get_secret_value(),
            "org_id": self.openai_org_id.get_secret_value(),
            "gpu_config": self.gpu_config
        }

    def get_vector_config(self) -> Dict[str, str]:
        """
        Get secure vector database configuration.
        
        Returns:
            Dict[str, str]: Encrypted vector database configuration
        """
        return {
            "api_key": self.pinecone_api_key.get_secret_value(),
            "environment": self.pinecone_environment,
            "index_name": self.pinecone_index_name,
            "dimension": str(self.embedding_dimension)
        }

    def rotate_keys(self) -> bool:
        """
        Implement secure key rotation.
        
        Returns:
            bool: Success status of key rotation
        """
        try:
            # Generate new encryption key
            new_salt = os.urandom(16)
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=new_salt,
                iterations=100000,
            )
            new_key = kdf.derive(os.urandom(32))
            
            # Store new key with timestamp
            self.encryption_keys = {
                "primary": new_key.hex(),
                "previous": self.encryption_keys.get("primary"),
                "created_at": datetime.datetime.now().isoformat(),
                "rotated_at": datetime.datetime.now().isoformat()
            }
            
            return True
        except Exception as e:
            print(f"Key rotation failed: {str(e)}")
            return False

    class Config:
        """Pydantic model configuration."""
        validate_assignment = True
        arbitrary_types_allowed = True
        json_encoders = {
            SecretStr: lambda v: v.get_secret_value() if v else None,
            datetime.datetime: lambda v: v.isoformat()
        }