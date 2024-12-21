# Stage 1: Build environment
FROM golang:1.21-alpine3.18 AS builder

# Set build-time variables for optimization and security
ENV CGO_ENABLED=0 \
    GOOS=linux \
    GOARCH=amd64 \
    GO111MODULE=on

# Set working directory
WORKDIR /build

# Install build dependencies
RUN apk add --no-cache \
    git=2.40.1-r0 \
    ca-certificates=20230506-r0 \
    && update-ca-certificates

# Copy go mod files first for better layer caching
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download && \
    go mod verify

# Copy source code with appropriate permissions
COPY . .
RUN chmod -R 755 /build

# Build the application with security flags and optimizations
RUN go build \
    -ldflags="-w -s \
    -X main.Version=$(git describe --tags --always) \
    -X main.BuildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    -trimpath \
    -o workflow-engine \
    ./cmd/server

# Verify binary
RUN ./workflow-engine --version || true

# Stage 2: Production runtime
FROM alpine:3.18.4

# Set runtime variables
ENV PORT=8080 \
    METRICS_PORT=9090 \
    GIN_MODE=release

# Add non-root user for security
RUN addgroup -g 1001 workflow && \
    adduser -u 1001 -G workflow -s /bin/sh -D workflow && \
    mkdir -p /app /var/log/workflow-engine && \
    chown -R workflow:workflow /app /var/log/workflow-engine

# Install runtime dependencies and security updates
RUN apk add --no-cache \
    ca-certificates=20230506-r0 \
    tzdata=2023c-r1 \
    && update-ca-certificates \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy binary from builder with appropriate permissions
COPY --from=builder --chown=workflow:workflow /build/workflow-engine .

# Set up healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Switch to non-root user
USER workflow:workflow

# Expose ports for API and metrics
EXPOSE ${PORT} ${METRICS_PORT}

# Set security options
LABEL org.opencontainers.image.source="https://github.com/organization/workflow-engine" \
      org.opencontainers.image.description="Workflow Engine Service" \
      org.opencontainers.image.licenses="Proprietary"

# Configure resource constraints
ENV GOMAXPROCS=8 \
    GOMEMLIMIT=1024MiB

# Set entry point with proper signal handling
ENTRYPOINT ["./workflow-engine"]