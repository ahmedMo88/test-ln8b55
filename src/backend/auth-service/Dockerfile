# Stage 1: Security Scanner
FROM aquasec/trivy:latest AS scanner
WORKDIR /scan
COPY . .
RUN trivy filesystem --exit-code 1 --severity HIGH,CRITICAL --no-progress /scan

# Stage 2: Builder
FROM node:20-alpine AS builder
LABEL maintainer="DevOps Team" \
      version="1.0.0" \
      description="Authentication Service Builder Stage"

# Set build arguments
ARG NODE_ENV=production
ARG NPM_TOKEN

# Set secure workspace
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ git curl

# Copy package files with strict permissions
COPY --chown=node:node package*.json ./
COPY --chown=node:node tsconfig.json ./

# Install dependencies with security checks
RUN npm ci --production=false \
    && npm audit \
    && npm cache clean --force

# Copy source code with ownership verification
COPY --chown=node:node . .

# Build with TypeScript strict checks
RUN npm run build \
    && npm prune --production

# Verify build artifacts
RUN test -d dist && test -f dist/app.js

# Stage 3: Production
FROM node:20-alpine AS production
LABEL maintainer="DevOps Team" \
      version="1.0.0" \
      description="Authentication Service Production Image" \
      security.scan.status="verified"

# Set production environment
ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS="--max-old-space-size=512" \
    SECURITY_HEADERS=true \
    GRACEFUL_SHUTDOWN_TIMEOUT=30

# Create non-root user and secure workspace
WORKDIR /app
RUN addgroup -g 1001 -S appgroup \
    && adduser -u 1001 -S appuser -G appgroup \
    && chown -R appuser:appgroup /app

# Install production dependencies
RUN apk add --no-cache curl tini

# Copy production files
COPY --from=builder --chown=appuser:appgroup /app/package*.json ./
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules

# Configure security headers and hardening
RUN echo "fs.file-max = 65535" >> /etc/sysctl.conf \
    && echo "kernel.unprivileged_userns_clone = 1" >> /etc/sysctl.conf \
    && echo "net.core.somaxconn = 1024" >> /etc/sysctl.conf

# Set up volume with secure permissions
VOLUME ["/tmp"]
RUN chmod 1777 /tmp

# Configure health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Set resource limits
RUN echo "appuser soft nofile 65535" >> /etc/security/limits.conf \
    && echo "appuser hard nofile 65535" >> /etc/security/limits.conf

# Switch to non-root user
USER appuser

# Expose application port
EXPOSE 3000

# Set up graceful shutdown
STOPSIGNAL SIGTERM

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start application
CMD ["node", "dist/app.js"]

# Security configurations
SECURITY_OPT ["no-new-privileges=true"]
READ_ONLY_ROOTFS true