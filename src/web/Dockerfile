# Stage 1: Builder
FROM node:20-alpine AS builder

# Security hardening
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl \
    && rm -rf /var/cache/apk/*

# Set secure environment variables
ENV NODE_ENV=production \
    NPM_CONFIG_AUDIT=true \
    NPM_CONFIG_AUDIT_LEVEL=moderate \
    NPM_CONFIG_STRICT_SSL=true \
    NPM_CONFIG_LOGLEVEL=error \
    NPM_CONFIG_PRODUCTION=true \
    NPM_CONFIG_FUND=false

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Copy package files with integrity verification
COPY --chown=appuser:appgroup package*.json ./
COPY --chown=appuser:appgroup yarn.lock ./

# Install dependencies with security checks
RUN npm ci --audit=true && \
    npm audit fix --audit-level=moderate && \
    npm cache clean --force

# Copy source code
COPY --chown=appuser:appgroup . .

# Build application with optimizations
ARG API_URL
ARG WS_URL
ENV VITE_API_URL=${API_URL} \
    VITE_WS_URL=${WS_URL}

RUN npm run typecheck && \
    npm run lint && \
    npm run test && \
    npm run build

# Stage 2: Production
FROM nginx:1.25-alpine

# Security hardening
RUN apk update && \
    apk upgrade && \
    apk add --no-cache \
    curl \
    tzdata \
    && rm -rf /var/cache/apk/*

# Create nginx user and group
RUN addgroup -S nginxgroup && \
    adduser -S nginxuser -G nginxgroup && \
    chown -R nginxuser:nginxgroup /var/cache/nginx && \
    chown -R nginxuser:nginxgroup /var/log/nginx && \
    chown -R nginxuser:nginxgroup /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginxuser:nginxgroup /var/run/nginx.pid

# Remove default nginx configuration
RUN rm -rf /etc/nginx/conf.d/* /usr/share/nginx/html/*

# Copy custom nginx configuration
COPY --chown=nginxuser:nginxgroup nginx.conf /etc/nginx/nginx.conf

# Copy built assets from builder stage
COPY --from=builder --chown=nginxuser:nginxgroup /app/dist /usr/share/nginx/html

# Configure security headers and permissions
RUN chmod -R 755 /usr/share/nginx/html && \
    chmod 644 /usr/share/nginx/html/* && \
    chmod -R 755 /var/cache/nginx /var/log/nginx /var/run

# Setup tmpfs volumes
VOLUME ["/var/cache/nginx", "/var/run", "/var/log/nginx"]

# Switch to non-root user
USER nginxuser

# Health check configuration
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Container metadata
LABEL maintainer="DevOps Team" \
      application="workflow-automation-platform" \
      component="web-frontend" \
      version="${BUILD_VERSION:-dev}" \
      build_date="${BUILD_DATE}" \
      git_commit="${GIT_COMMIT}" \
      security_scan="${SCAN_RESULT}"

# Expose port
EXPOSE 80

# Set read-only root filesystem
CMD ["nginx", "-g", "daemon off;"]

# Security options
SECURITY_OPT ["no-new-privileges:true"]
CAPABILITIES drop=ALL,add=NET_BIND_SERVICE

# Resource limits
LIMIT_CPU "1.0"
LIMIT_MEMORY "512M"