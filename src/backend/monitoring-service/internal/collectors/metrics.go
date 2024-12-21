// Package collectors provides metrics collection and monitoring functionality
// with Prometheus integration for system reliability tracking.
package collectors

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Default configuration values for metrics collection
const (
	defaultMetricNamespace   = "workflow_automation"
	defaultMetricSubsystem   = "monitoring"
	defaultMetricTimeout     = 5 * time.Second
	maxMetricNameLength      = 255
	maxLabelValueLength      = 255
	defaultMetricMapCapacity = 100
)

// Default response time buckets for histogram metrics (in seconds)
var defaultResponseTimeBuckets = []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5}

// metricInfo stores metadata about registered metrics
type metricInfo struct {
	collector prometheus.Collector
	labels    map[string]string
	lastUpdate time.Time
}

// MetricsCollector provides thread-safe metrics collection with Prometheus integration
type MetricsCollector struct {
	registry   *prometheus.Registry
	namespace  string
	subsystem  string
	mutex      sync.RWMutex
	metrics    map[string]metricInfo
	timeout    time.Duration

	// System metrics
	responseTime prometheus.Histogram
	requests     prometheus.Counter
	errors       prometheus.Counter
	uptime       prometheus.Gauge
}

// NewMetricsCollector creates and initializes a new metrics collector with default configuration
func NewMetricsCollector() *MetricsCollector {
	mc := &MetricsCollector{
		registry:  prometheus.NewRegistry(),
		namespace: defaultMetricNamespace,
		subsystem: defaultMetricSubsystem,
		metrics:   make(map[string]metricInfo, defaultMetricMapCapacity),
		timeout:   defaultMetricTimeout,
	}

	// Initialize system metrics
	mc.responseTime = promauto.NewHistogram(prometheus.HistogramOpts{
		Namespace: mc.namespace,
		Subsystem: mc.subsystem,
		Name:      "response_time_seconds",
		Help:      "Response time distribution in seconds",
		Buckets:   defaultResponseTimeBuckets,
	})

	mc.requests = promauto.NewCounter(prometheus.CounterOpts{
		Namespace: mc.namespace,
		Subsystem: mc.subsystem,
		Name:      "requests_total",
		Help:      "Total number of requests processed",
	})

	mc.errors = promauto.NewCounter(prometheus.CounterOpts{
		Namespace: mc.namespace,
		Subsystem: mc.subsystem,
		Name:      "errors_total",
		Help:      "Total number of errors encountered",
	})

	mc.uptime = promauto.NewGauge(prometheus.GaugeOpts{
		Namespace: mc.namespace,
		Subsystem: mc.subsystem,
		Name:      "uptime_seconds",
		Help:      "System uptime in seconds",
	})

	// Register system metrics with the registry
	mc.registry.MustRegister(mc.responseTime)
	mc.registry.MustRegister(mc.requests)
	mc.registry.MustRegister(mc.errors)
	mc.registry.MustRegister(mc.uptime)

	// Start uptime tracking
	go mc.trackUptime()

	return mc
}

// WithNamespace sets a custom namespace for metrics
func (mc *MetricsCollector) WithNamespace(namespace string) *MetricsCollector {
	if err := validateMetricName(namespace); err != nil {
		// Log error but maintain default namespace
		return mc
	}
	mc.mutex.Lock()
	mc.namespace = namespace
	mc.mutex.Unlock()
	return mc
}

// WithTimeout sets a custom timeout for metric collection operations
func (mc *MetricsCollector) WithTimeout(timeout time.Duration) *MetricsCollector {
	if timeout <= 0 {
		return mc
	}
	mc.mutex.Lock()
	mc.timeout = timeout
	mc.mutex.Unlock()
	return mc
}

// RegisterMetric registers a new metric with validation and thread-safety
func (mc *MetricsCollector) RegisterMetric(metric prometheus.Collector, name string, labels map[string]string) error {
	if err := validateMetricName(name); err != nil {
		return fmt.Errorf("invalid metric name: %w", err)
	}

	if err := validateLabels(labels); err != nil {
		return fmt.Errorf("invalid labels: %w", err)
	}

	mc.mutex.Lock()
	defer mc.mutex.Unlock()

	// Check for existing metric
	if _, exists := mc.metrics[name]; exists {
		return fmt.Errorf("metric %s already registered", name)
	}

	// Register with Prometheus
	if err := mc.registry.Register(metric); err != nil {
		return fmt.Errorf("failed to register metric: %w", err)
	}

	// Store metric info
	mc.metrics[name] = metricInfo{
		collector:  metric,
		labels:     labels,
		lastUpdate: time.Now(),
	}

	return nil
}

// CollectMetrics collects metrics with timeout and batch processing
func (mc *MetricsCollector) CollectMetrics(ctx context.Context) error {
	timeoutCtx, cancel := context.WithTimeout(ctx, mc.timeout)
	defer cancel()

	mc.mutex.RLock()
	defer mc.mutex.RUnlock()

	metricsChan := make(chan prometheus.Metric, len(mc.metrics))
	errChan := make(chan error, 1)

	go func() {
		if err := mc.registry.Gather(); err != nil {
			errChan <- fmt.Errorf("failed to gather metrics: %w", err)
			return
		}
		close(metricsChan)
	}()

	select {
	case err := <-errChan:
		return err
	case <-timeoutCtx.Done():
		return fmt.Errorf("metrics collection timed out: %w", timeoutCtx.Err())
	case <-ctx.Done():
		return fmt.Errorf("context cancelled: %w", ctx.Err())
	}
}

// trackUptime continuously updates the uptime metric
func (mc *MetricsCollector) trackUptime() {
	startTime := time.Now()
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		mc.uptime.Set(time.Since(startTime).Seconds())
	}
}

// validateMetricName validates the format and length of metric names
func validateMetricName(name string) error {
	if name == "" {
		return errors.New("metric name cannot be empty")
	}
	if len(name) > maxMetricNameLength {
		return fmt.Errorf("metric name exceeds maximum length of %d", maxMetricNameLength)
	}
	// Add additional validation rules as needed
	return nil
}

// validateLabels validates metric labels and their values
func validateLabels(labels map[string]string) error {
	for k, v := range labels {
		if k == "" {
			return errors.New("label name cannot be empty")
		}
		if len(v) > maxLabelValueLength {
			return fmt.Errorf("label value exceeds maximum length of %d", maxLabelValueLength)
		}
		// Add additional validation rules as needed
	}
	return nil
}

// Handler returns an HTTP handler for exposing metrics
func (mc *MetricsCollector) Handler() http.Handler {
	return promhttp.HandlerFor(mc.registry, promhttp.HandlerOpts{
		Registry:          mc.registry,
		EnableOpenMetrics: true,
	})
}