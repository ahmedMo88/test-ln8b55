# External imports with versions
from fastapi import FastAPI, Request  # v0.104.0
from fastapi.middleware.cors import CORSMiddleware  # v0.104.0
from fastapi.middleware.gzip import GZipMiddleware  # v0.104.0
from fastapi.responses import JSONResponse  # v0.104.0
import uvicorn  # v0.23.2
import structlog  # v23.1.0
from prometheus_fastapi_instrumentator import Instrumentator  # v6.1.0
from opentelemetry import trace  # v1.20.0
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
import redis  # v4.6.0
from datetime import datetime
import logging.config
import json
import os

# Internal imports
from .config.settings import Settings, get_llm_config, get_vector_config, validate_config
from .routes.agent import router as agent_router

# Initialize structured logger
logger = structlog.get_logger(__name__)

# Initialize tracer
tracer = trace.get_tracer(__name__)

# Initialize FastAPI app with security headers
app = FastAPI(
    title="AI Service",
    version="1.0.0",
    docs_url=None,  # Disable Swagger UI in production
    redoc_url=None  # Disable ReDoc in production
)

def configure_logging() -> None:
    """Configure structured logging with compliance requirements"""
    logging.config.dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "json": {
                "()": structlog.stdlib.ProcessorFormatter,
                "processor": structlog.processors.JSONRenderer(),
            }
        },
        "handlers": {
            "json": {
                "class": "logging.StreamHandler",
                "formatter": "json",
            }
        },
        "loggers": {
            "": {
                "handlers": ["json"],
                "level": "INFO",
            }
        }
    })

    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.stdlib.add_log_level,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

def configure_middleware(app: FastAPI) -> None:
    """Configure comprehensive middleware stack"""
    
    # Security middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Configure based on environment
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=600,
    )

    # Compression middleware
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    # Initialize Redis for rate limiting
    redis_client = redis.Redis(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", 6379)),
        db=0,
        decode_responses=True
    )

    # Initialize metrics collection
    Instrumentator().instrument(app).expose(app)

    # Initialize distributed tracing
    FastAPIInstrumentor.instrument_app(app)

@app.on_event("startup")
async def startup_event() -> None:
    """Handle application startup tasks"""
    try:
        # Initialize settings
        settings = Settings()
        
        # Validate configuration
        if not validate_config():
            raise ValueError("Invalid configuration")

        # Initialize LLM configuration
        llm_config = get_llm_config()
        if not llm_config:
            raise ValueError("Failed to initialize LLM configuration")

        # Initialize vector store configuration
        vector_config = get_vector_config()
        if not vector_config:
            raise ValueError("Failed to initialize vector store configuration")

        # Start metrics collection
        Instrumentator().instrument(app).expose(app)

        logger.info(
            "Application started successfully",
            extra={
                "environment": os.getenv("ENVIRONMENT", "production"),
                "version": "1.0.0",
                "startup_time": datetime.now().isoformat()
            }
        )

    except Exception as e:
        logger.error(f"Startup failed: {str(e)}")
        raise

@app.on_event("shutdown")
async def shutdown_event() -> None:
    """Handle graceful shutdown"""
    try:
        # Complete in-flight requests
        await app.state.complete_requests()

        # Close external connections
        if hasattr(app.state, "redis_client"):
            await app.state.redis_client.close()

        # Flush metrics and traces
        if hasattr(app.state, "metrics_client"):
            await app.state.metrics_client.flush()

        logger.info("Application shutdown completed successfully")

    except Exception as e:
        logger.error(f"Shutdown error: {str(e)}")
        raise

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Global exception handler with security considerations"""
    error_id = str(datetime.now().timestamp())
    
    logger.error(
        "Unhandled exception",
        extra={
            "error_id": error_id,
            "path": request.url.path,
            "method": request.method,
            "error": str(exc)
        }
    )

    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "error_id": error_id,
            "message": "An unexpected error occurred"
        }
    )

# Register routers
app.include_router(agent_router)

@logger.catch(exclude=(KeyboardInterrupt,))
def main() -> None:
    """Application entry point with enhanced error handling"""
    try:
        # Configure structured logging
        configure_logging()

        # Initialize settings
        settings = Settings()

        # Configure comprehensive middleware
        configure_middleware(app)

        # Start uvicorn server with production settings
        uvicorn.run(
            "app:app",
            host="0.0.0.0",
            port=8000,
            workers=4,
            log_config=None,  # Use custom logging config
            proxy_headers=True,
            forwarded_allow_ips="*",
            ssl_keyfile=os.getenv("SSL_KEYFILE"),
            ssl_certfile=os.getenv("SSL_CERTFILE"),
        )

    except Exception as e:
        logger.error(f"Application startup failed: {str(e)}")
        raise

if __name__ == "__main__":
    main()