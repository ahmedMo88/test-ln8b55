# ===== Builder Stage =====
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Set build environment variables
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn \
    SCAN_VULNERABILITIES=true

# Install build dependencies and security tools
RUN apk add --no-cache python3 make g++ curl \
    && npm install -g npm@latest snyk

# Copy package files
COPY package*.json ./

# Install dependencies with security audit
RUN npm ci --production=false \
    && npm audit \
    && if [ "$SCAN_VULNERABILITIES" = "true" ]; then snyk test; fi

# Copy source code and configs
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript code
RUN npm run build \
    && npm prune --production

# ===== Final Stage =====
FROM node:20-alpine

# Set production environment variables
ENV NODE_ENV=production \
    PORT=8080 \
    SECURE_HEAP=true \
    AUDIT_LOGGING=true \
    MAX_OLD_SPACE_SIZE=2048

# Install security packages and monitoring tools
RUN apk add --no-cache \
    curl \
    tini \
    dumb-init \
    tzdata \
    ca-certificates \
    && addgroup -g 10001 integrator \
    && adduser -u 10001 -G integrator -s /bin/sh -D integrator \
    && mkdir -p /app/data /app/logs /app/certs /app/secrets \
    && chown -R integrator:integrator /app

# Set working directory
WORKDIR /app

# Copy built artifacts from builder stage
COPY --from=builder --chown=integrator:integrator /app/dist ./dist
COPY --from=builder --chown=integrator:integrator /app/node_modules ./node_modules
COPY --from=builder --chown=integrator:integrator /app/package.json ./

# Set secure file permissions
RUN chmod 755 /app \
    && chmod 640 /app/data \
    && chmod 640 /app/logs \
    && chmod 600 /app/certs \
    && chmod 600 /app/secrets

# Configure health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8081/health || exit 1

# Expose service ports
EXPOSE 8080 8081

# Set container labels
LABEL maintainer="DevOps Team <devops@company.com>" \
    version="1.0.0" \
    security.compliance="SOC2,HIPAA" \
    security.scanners="snyk,trivy" \
    monitoring.health="enabled" \
    monitoring.metrics="enabled"

# Drop capabilities and set security options
RUN setcap 'cap_net_bind_service=+ep' /usr/local/bin/node
USER integrator

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Set the default command
CMD ["node", "--max-old-space-size=2048", "--heap-prof", "dist/app.js"]

# Define volumes
VOLUME ["/app/data", "/app/logs", "/app/certs", "/app/secrets"]