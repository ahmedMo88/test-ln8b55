// Package handlers provides HTTP handlers for service health monitoring
// with enhanced reliability, security, and performance features.
package handlers

import (
    "context"
    "encoding/json"
    "net/http"
    "sync"
    "time"

    "golang.org/x/time/rate" // v0.0.0-20220922204420-00f56bc4866

    "src/backend/monitoring-service/internal/collectors"
)

const (
    // Default configuration values
    defaultTimeout    = 5 * time.Second
    defaultRateLimit = 100 // requests per minute

    // HTTP response headers for security
    headerContentType     = "Content-Type"
    headerContentTypeJSON = "application/json"
    headerCacheControl   = "Cache-Control"
    headerNoCache        = "no-store, no-cache, must-revalidate"
    headerSecurityPolicy = "Content-Security-Policy"
    headerCSPValue       = "default-src 'none'"
)

// HealthStatus represents the current health state of the service
type HealthStatus struct {
    Status    string            `json:"status"`
    Timestamp time.Time         `json:"timestamp"`
    Version   string           `json:"version"`
    Details   map[string]string `json:"details,omitempty"`
}

// HealthResponse encapsulates the health check response
type HealthResponse struct {
    Status    string            `json:"status"`
    Timestamp time.Time         `json:"timestamp"`
    Checks    map[string]bool   `json:"checks,omitempty"`
    Metrics   map[string]string `json:"metrics,omitempty"`
}

// HealthHandler provides enhanced health check endpoints with monitoring
type HealthHandler struct {
    collector       *collectors.MetricsCollector
    timeout         time.Duration
    rateLimiter    *rate.Limiter
    responsePool   *sync.Pool
    securityHeaders map[string]string
}

// Options configures the HealthHandler behavior
type Options struct {
    Timeout    time.Duration
    RateLimit  int
    Version    string
}

var (
    // Response object pool for performance optimization
    responsePool = &sync.Pool{
        New: func() interface{} {
            return &HealthResponse{
                Checks:  make(map[string]bool),
                Metrics: make(map[string]string),
            }
        },
    }
)

// NewHealthHandler creates a new health check handler with enhanced configuration
func NewHealthHandler(collector *collectors.MetricsCollector, opts Options) *HealthHandler {
    if collector == nil {
        panic("metrics collector is required")
    }

    // Configure default timeout if not specified
    if opts.Timeout == 0 {
        opts.Timeout = defaultTimeout
    }

    // Configure rate limiter
    rateLimit := float64(defaultRateLimit)
    if opts.RateLimit > 0 {
        rateLimit = float64(opts.RateLimit)
    }

    // Initialize security headers
    securityHeaders := map[string]string{
        headerContentType:     headerContentTypeJSON,
        headerCacheControl:   headerNoCache,
        headerSecurityPolicy: headerCSPValue,
    }

    return &HealthHandler{
        collector:       collector,
        timeout:        opts.Timeout,
        rateLimiter:    rate.NewLimiter(rate.Limit(rateLimit), int(rateLimit)),
        responsePool:   responsePool,
        securityHeaders: securityHeaders,
    }
}

// HandleLiveness implements the liveness probe endpoint
func (h *HealthHandler) HandleLiveness(w http.ResponseWriter, r *http.Request) {
    // Apply rate limiting
    if !h.rateLimiter.Allow() {
        http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
        return
    }

    // Start latency tracking
    start := time.Now()
    defer func() {
        h.collector.CollectMetrics(context.Background())
    }()

    // Get response object from pool
    resp := h.responsePool.Get().(*HealthResponse)
    defer h.responsePool.Put(resp)

    // Reset response object
    resp.Status = "UP"
    resp.Timestamp = time.Now()
    resp.Checks = make(map[string]bool)
    resp.Metrics = make(map[string]string)

    // Set security headers
    for k, v := range h.securityHeaders {
        w.Header().Set(k, v)
    }

    // Write response
    w.WriteHeader(http.StatusOK)
    if err := json.NewEncoder(w).Encode(resp); err != nil {
        http.Error(w, "failed to encode response", http.StatusInternalServerError)
        return
    }
}

// HandleReadiness implements the readiness probe endpoint with detailed health checks
func (h *HealthHandler) HandleReadiness(w http.ResponseWriter, r *http.Request) {
    // Apply rate limiting
    if !h.rateLimiter.Allow() {
        http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
        return
    }

    // Create context with timeout
    ctx, cancel := context.WithTimeout(r.Context(), h.timeout)
    defer cancel()

    // Start latency tracking
    start := time.Now()
    defer func() {
        h.collector.CollectMetrics(context.Background())
    }()

    // Get response object from pool
    resp := h.responsePool.Get().(*HealthResponse)
    defer h.responsePool.Put(resp)

    // Reset response object
    resp.Status = "UP"
    resp.Timestamp = time.Now()
    resp.Checks = make(map[string]bool)
    resp.Metrics = make(map[string]string)

    // Perform health checks
    errChan := make(chan error, 1)
    go func() {
        if err := h.collector.CollectMetrics(ctx); err != nil {
            errChan <- err
            return
        }
        close(errChan)
    }()

    // Wait for health checks or timeout
    select {
    case err := <-errChan:
        if err != nil {
            resp.Status = "DOWN"
            resp.Checks["metrics_collector"] = false
        } else {
            resp.Checks["metrics_collector"] = true
        }
    case <-ctx.Done():
        resp.Status = "DOWN"
        resp.Checks["timeout"] = false
    }

    // Set security headers
    for k, v := range h.securityHeaders {
        w.Header().Set(k, v)
    }

    // Set response status code
    statusCode := http.StatusOK
    if resp.Status != "UP" {
        statusCode = http.StatusServiceUnavailable
    }

    // Write response
    w.WriteHeader(statusCode)
    if err := json.NewEncoder(w).Encode(resp); err != nil {
        http.Error(w, "failed to encode response", http.StatusInternalServerError)
        return
    }
}

// WithTimeout sets a custom timeout for health checks
func (h *HealthHandler) WithTimeout(timeout time.Duration) *HealthHandler {
    if timeout > 0 {
        h.timeout = timeout
    }
    return h
}

// WithRateLimit sets a custom rate limit for health endpoints
func (h *HealthHandler) WithRateLimit(limit int) *HealthHandler {
    if limit > 0 {
        h.rateLimiter = rate.NewLimiter(rate.Limit(float64(limit)), limit)
    }
    return h
}