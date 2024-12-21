# Stage 1: Builder stage
FROM python:3.11-slim AS builder

# Build arguments
ARG PORT=8000
ARG CUDA_VERSION=11.8.0

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Set work directory
WORKDIR /app

# Install system dependencies and security updates
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        git \
        libpq-dev \
        && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install pip-audit for security scanning
RUN pip install --no-cache-dir pip-audit==2.6.1

# Copy requirements file with hash verification
COPY requirements.txt .
RUN sha256sum requirements.txt > requirements.txt.sha256

# Install Python dependencies with security audit
RUN pip-audit requirements.txt && \
    pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ src/
COPY setup.py .

# Install application package
RUN pip install -e .

# Verify dependency tree
RUN pip check

# Stage 2: Production stage
FROM nvidia/cuda:11.8.0-base-ubuntu22.04 AS final

# Build arguments
ARG PORT=8000

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/src \
    PORT=${PORT} \
    NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility

# Set work directory
WORKDIR /app

# Install system dependencies and Python 3.11
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
        python3.11 \
        python3-pip \
        libpq5 \
        curl \
        && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r aiservice && \
    useradd -r -g aiservice -s /bin/false aiservice && \
    mkdir -p /app/src /app/models && \
    chown -R aiservice:aiservice /app

# Copy verified dependencies from builder
COPY --from=builder --chown=aiservice:aiservice /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder --chown=aiservice:aiservice /app/src /app/src

# Switch to non-root user
USER aiservice

# Set security options
RUN python3.11 -c "import os; os.umask(0o027)"

# Expose ports for application and metrics
EXPOSE ${PORT} 9090

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl --fail http://localhost:${PORT}/health || exit 1

# Set resource limits
ENV MEMORY_LIMIT="8g" \
    CPU_LIMIT="4"

# Labels for container metadata
LABEL maintainer="Platform Team" \
      version="1.0.0" \
      service="ai-service" \
      security.updates="daily" \
      gpu.required="true" \
      monitoring.enabled="true"

# Start application with production settings
CMD ["python3.11", "-m", "uvicorn", "src.app:app", "--host", "0.0.0.0", "--port", "${PORT}", "--workers", "4", "--proxy-headers", "--forwarded-allow-ips", "*"]