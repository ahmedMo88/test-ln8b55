# -----------------------------
# Go Builder Stage
# -----------------------------
FROM golang:1.21-alpine3.18 AS go-builder

# Security and build dependencies
RUN apk add --no-cache \
    ca-certificates=20230506-r0 \
    git=2.40.1-r0 \
    gcc=12.2.1_git20220924-r10 \
    musl-dev=1.2.4-r2 \
    make=4.4.1-r1

WORKDIR /build

# Copy Go module files
COPY go.mod go.sum ./

# Security scan and dependency installation
RUN go mod download && \
    go mod verify

# Copy source code with proper permissions
COPY workflow-engine/ ./workflow-engine/
RUN chown -R nobody:nobody /build

# Build with security flags
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s -extldflags=-static" \
    -tags 'netgo osusergo static_build' \
    -o /go/bin/workflow-engine ./workflow-engine/cmd/main.go

# -----------------------------
# Node.js Builder Stage
# -----------------------------
FROM node:20-alpine3.18 AS node-builder

# Security hardening
RUN apk add --no-cache \
    python3=3.11.6-r0 \
    make=4.4.1-r1 \
    g++=12.2.1_git20220924-r10

WORKDIR /build

# Optimize npm cache and install dependencies
COPY package*.json ./
COPY --chown=node:node . .

# Install dependencies with security audit
RUN npm ci --only=production && \
    npm audit fix && \
    npm cache clean --force

# Build TypeScript services
RUN npm run build

# -----------------------------
# Python Builder Stage
# -----------------------------
FROM python:3.11-slim-bullseye AS python-builder

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential=12.9 \
    curl=7.74.0-1.3+deb11u10 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy and install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python source code
COPY ai-service/ ./ai-service/

# -----------------------------
# Final Runtime Stage
# -----------------------------
FROM nvidia/cuda:11.8.0-base-ubuntu22.04 AS runtime

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates=20230311ubuntu0.22.04.1 \
    tzdata=2023c-0ubuntu0.22.04.2 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser -s /sbin/nologin appuser

# Set working directory
WORKDIR /app

# Copy artifacts from builders
COPY --from=go-builder /go/bin/workflow-engine /app/workflow-engine
COPY --from=node-builder /build/dist /app/api-gateway
COPY --from=python-builder /build/ai-service /app/ai-service
COPY --from=python-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages

# Set environment variables
ENV NODE_ENV=production \
    PYTHONUNBUFFERED=1 \
    GO111MODULE=on \
    NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility

# Create necessary directories with proper permissions
RUN mkdir -p /app/data /app/logs /app/cache && \
    chown -R appuser:appuser /app

# Expose service ports
EXPOSE 3000 8000 9000

# Set up healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Switch to non-root user
USER appuser

# Set security options
LABEL org.opencontainers.image.source="https://github.com/workflow-automation/backend" \
      org.opencontainers.image.description="Workflow Automation Backend Services" \
      org.opencontainers.image.licenses="MIT"

# Set default command
CMD ["./workflow-engine"]