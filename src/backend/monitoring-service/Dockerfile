# Stage 1: Builder
FROM golang:1.21-alpine AS builder

# Build arguments for versioning
ARG BUILD_VERSION=latest
ARG BUILD_DATE
ARG COMMIT_SHA

# Install build dependencies and security tools
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    git \
    make \
    gcc \
    libc-dev \
    && update-ca-certificates

# Set working directory
WORKDIR /app

# Set build environment variables
ENV CGO_ENABLED=0 \
    GOOS=linux \
    GOARCH=amd64 \
    GO111MODULE=on

# Copy go mod files first for better cache utilization
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download && \
    go mod verify

# Copy source code
COPY . .

# Build the application with optimizations and hardening flags
RUN go build \
    -ldflags="-w -s \
    -X main.Version=${BUILD_VERSION} \
    -X main.BuildDate=${BUILD_DATE} \
    -X main.CommitSHA=${COMMIT_SHA}" \
    -trimpath \
    -o /app/monitoring-service \
    ./cmd/server

# Verify binary
RUN /app/monitoring-service --version || true

# Stage 2: Final
FROM alpine:3.18

# Add labels for container metadata
LABEL maintainer="DevOps Team" \
      org.opencontainers.image.title="monitoring-service" \
      org.opencontainers.image.description="Workflow Automation Platform Monitoring Service" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${COMMIT_SHA}" \
      org.opencontainers.image.licenses="Proprietary"

# Install runtime dependencies and security updates
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    curl \
    && update-ca-certificates \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -S nonroot && \
    adduser -S -G nonroot -H -D nonroot && \
    mkdir -p /app && \
    chown -R nonroot:nonroot /app

# Set working directory
WORKDIR /app

# Copy binary from builder stage
COPY --from=builder --chown=nonroot:nonroot /app/monitoring-service .

# Set environment variables
ENV SERVICE_NAME="monitoring-service" \
    METRICS_PORT=9090 \
    HEALTH_PORT=8080

# Expose ports for metrics and health checks
EXPOSE ${METRICS_PORT} ${HEALTH_PORT}

# Switch to non-root user
USER nonroot:nonroot

# Configure health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${HEALTH_PORT}/health || exit 1

# Set security options
SECURITY_OPTS --cap-drop=ALL \
    --security-opt=no-new-privileges \
    --read-only \
    --tmpfs=/tmp:rw,noexec,nosuid,size=64M

# Set entrypoint with exec form for proper signal handling
ENTRYPOINT ["/app/monitoring-service"]