# =====================================
# Builder Stage
# =====================================
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies and security updates
RUN apk update && \
    apk add --no-cache \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/cache/apk/*

# Copy package files for dependency caching
COPY package*.json ./

# Install dependencies with strict security and integrity checks
RUN npm ci --ignore-scripts && \
    npm audit

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code
COPY src/ ./src/

# Build TypeScript code with strict checks
RUN npm run build && \
    npm prune --production

# =====================================
# Production Stage
# =====================================
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install production dependencies and security updates
RUN apk update && \
    apk add --no-cache \
    curl \
    tini \
    && rm -rf /var/cache/apk/*

# Create non-root user and group
RUN addgroup -g 1001 nodeapp && \
    adduser -u 1001 -G nodeapp -s /bin/sh -D nodeapp

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --production --ignore-scripts && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Set proper ownership
RUN chown -R nodeapp:nodeapp /app

# Configure security measures
RUN mkdir -p /tmp/nodeapp && \
    chown -R nodeapp:nodeapp /tmp/nodeapp

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS="--max-old-space-size=2048" \
    # Security-related environment variables
    NPM_CONFIG_AUDIT=true \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UNSAFE_PERM=false

# Switch to non-root user
USER nodeapp

# Expose application port
EXPOSE 3000

# Configure health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Set resource limits
LABEL org.opencontainers.image.memory-limit="2G" \
      org.opencontainers.image.cpu-shares="1024"

# Configure volumes
VOLUME ["/tmp/nodeapp"]

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application with proper signal handling
CMD ["node", "dist/app.js"]

# Security labels
LABEL org.opencontainers.image.security.caps="NET_BIND_SERVICE" \
      org.opencontainers.image.security.no-new-privileges="true" \
      org.opencontainers.image.security.read-only-rootfs="true"

# Metadata labels
LABEL maintainer="DevOps Team <devops@company.com>" \
      org.opencontainers.image.title="API Gateway" \
      org.opencontainers.image.description="Enterprise-grade API Gateway service for workflow automation platform" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.vendor="Workflow Automation Platform"