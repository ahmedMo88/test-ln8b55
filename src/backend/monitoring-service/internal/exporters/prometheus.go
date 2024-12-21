// Package exporters provides metrics export functionality with support for
// various monitoring systems and protocols.
package exporters

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Default configuration values for the Prometheus exporter
const (
	defaultMetricsPath      = "/metrics"
	defaultMetricsPort     = ":9090"
	defaultShutdownTimeout = 30 * time.Second
	defaultReadTimeout     = 5 * time.Second
	defaultWriteTimeout    = 10 * time.Second
)

// PrometheusExporter manages the export of metrics via HTTP endpoint for Prometheus
// scraping with configuration options and security controls.
type PrometheusExporter struct {
	collector       *MetricsCollector
	server         *http.Server
	metricsPath    string
	listenAddress  string
	shutdownTimeout time.Duration
	readTimeout    time.Duration
	writeTimeout   time.Duration
}

// NewPrometheusExporter creates a new Prometheus exporter instance with the given
// metrics collector and default configuration.
func NewPrometheusExporter(collector *MetricsCollector) (*PrometheusExporter, error) {
	if collector == nil {
		return nil, fmt.Errorf("metrics collector cannot be nil")
	}

	exporter := &PrometheusExporter{
		collector:       collector,
		metricsPath:    defaultMetricsPath,
		listenAddress:  defaultMetricsPort,
		shutdownTimeout: defaultShutdownTimeout,
		readTimeout:    defaultReadTimeout,
		writeTimeout:   defaultWriteTimeout,
	}

	// Register default process and Go runtime metrics
	prometheus.DefaultRegisterer.MustRegister(prometheus.NewProcessCollector(prometheus.ProcessCollectorOpts{}))
	prometheus.DefaultRegisterer.MustRegister(prometheus.NewGoCollector())

	return exporter, nil
}

// WithPath sets a custom path for the metrics endpoint with validation.
func (e *PrometheusExporter) WithPath(path string) (*PrometheusExporter, error) {
	if !strings.HasPrefix(path, "/") {
		return nil, fmt.Errorf("metrics path must start with /")
	}

	if strings.Contains(path, "..") {
		return nil, fmt.Errorf("metrics path cannot contain path traversal")
	}

	e.metricsPath = path
	return e, nil
}

// WithListenAddress sets a custom listen address for the metrics server with validation.
func (e *PrometheusExporter) WithListenAddress(address string) (*PrometheusExporter, error) {
	if address == "" {
		return nil, fmt.Errorf("listen address cannot be empty")
	}

	if !strings.Contains(address, ":") {
		return nil, fmt.Errorf("listen address must include port")
	}

	e.listenAddress = address
	return e, nil
}

// WithTimeouts configures custom timeout values for the HTTP server.
func (e *PrometheusExporter) WithTimeouts(read, write, shutdown time.Duration) *PrometheusExporter {
	if read > 0 {
		e.readTimeout = read
	}
	if write > 0 {
		e.writeTimeout = write
	}
	if shutdown > 0 {
		e.shutdownTimeout = shutdown
	}
	return e
}

// securityMiddleware adds security headers and basic protections to the metrics endpoint.
func securityMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Security headers
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Content-Security-Policy", "default-src 'none'")

		// Only allow GET and HEAD methods
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Start starts the Prometheus metrics HTTP server with graceful shutdown support.
func (e *PrometheusExporter) Start(ctx context.Context) error {
	// Create server mux and register metrics handler with security middleware
	mux := http.NewServeMux()
	mux.Handle(e.metricsPath, securityMiddleware(promhttp.Handler()))

	// Configure the HTTP server
	e.server = &http.Server{
		Addr:         e.listenAddress,
		Handler:      mux,
		ReadTimeout:  e.readTimeout,
		WriteTimeout: e.writeTimeout,
		ErrorLog:     log.Default(),
	}

	// Channel to capture server errors
	errChan := make(chan error, 1)

	// Start the server in a goroutine
	go func() {
		log.Printf("Starting Prometheus metrics server on %s%s", e.listenAddress, e.metricsPath)
		if err := e.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errChan <- fmt.Errorf("metrics server error: %w", err)
		}
	}()

	// Monitor for shutdown signal or server error
	select {
	case <-ctx.Done():
		log.Println("Initiating graceful shutdown of metrics server...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), e.shutdownTimeout)
		defer cancel()

		if err := e.server.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("metrics server shutdown error: %w", err)
		}
		log.Println("Metrics server shutdown completed")
		return nil

	case err := <-errChan:
		return err
	}
}