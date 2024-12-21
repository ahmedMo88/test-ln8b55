// Package tracers provides distributed tracing functionality using Jaeger
package tracers

import (
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/opentracing/opentracing-go"
	"github.com/uber/jaeger-client-go"
	"github.com/uber/jaeger-client-go/config"
	"github.com/uber/jaeger-lib/metrics/prometheus"
)

// Default configuration values for Jaeger tracer
const (
	defaultServiceName     = "monitoring-service"
	defaultSamplingRate   = 0.1
	defaultJaegerEndpoint = "http://jaeger-collector:14268/api/traces"
	defaultBufferSize     = 1000
	defaultQueueSize      = 100000
	defaultFlushInterval  = time.Second
)

// TracerOptions contains configuration options for Jaeger tracer initialization
type TracerOptions struct {
	ServiceName       string
	SamplingRate     float64
	CollectorEndpoint string
	LogSpans         bool
	BufferSize       int
	QueueSize        int
	FlushInterval    time.Duration
	EnableMetrics    bool
}

// NewTracerOptions creates a new TracerOptions instance with default values
func NewTracerOptions() *TracerOptions {
	return &TracerOptions{
		ServiceName:       defaultServiceName,
		SamplingRate:     defaultSamplingRate,
		CollectorEndpoint: defaultJaegerEndpoint,
		LogSpans:         true,
		BufferSize:       defaultBufferSize,
		QueueSize:        defaultQueueSize,
		FlushInterval:    defaultFlushInterval,
		EnableMetrics:    true,
	}
}

// WithServiceName sets a custom service name for the tracer
func (o *TracerOptions) WithServiceName(name string) *TracerOptions {
	if name == "" {
		log.Printf("Warning: empty service name provided, using default: %s", defaultServiceName)
		return o
	}
	o.ServiceName = name
	return o
}

// WithSamplingRate sets a custom sampling rate for the tracer
func (o *TracerOptions) WithSamplingRate(rate float64) *TracerOptions {
	if rate < 0 || rate > 1 {
		log.Printf("Warning: invalid sampling rate provided (%.2f), using default: %.2f", rate, defaultSamplingRate)
		return o
	}
	o.SamplingRate = rate
	return o
}

// WithBufferSize sets a custom buffer size for the reporter
func (o *TracerOptions) WithBufferSize(size int) *TracerOptions {
	if size <= 0 {
		log.Printf("Warning: invalid buffer size provided (%d), using default: %d", size, defaultBufferSize)
		return o
	}
	o.BufferSize = size
	return o
}

// NewJaegerTracer creates and initializes a new Jaeger tracer instance
func NewJaegerTracer(serviceName string, samplingRate float64) (opentracing.Tracer, io.Closer, error) {
	opts := NewTracerOptions().
		WithServiceName(serviceName).
		WithSamplingRate(samplingRate)

	return NewJaegerTracerWithOptions(opts)
}

// NewJaegerTracerWithOptions creates a Jaeger tracer with custom options
func NewJaegerTracerWithOptions(opts *TracerOptions) (opentracing.Tracer, io.Closer, error) {
	if opts == nil {
		return nil, nil, errors.New("tracer options cannot be nil")
	}

	// Initialize metrics factory
	metricsFactory := prometheus.New()

	// Create Jaeger configuration
	cfg, err := createJaegerConfig(opts)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create Jaeger config: %w", err)
	}

	// Initialize tracer
	tracer, closer, err := cfg.NewTracer(
		config.Logger(jaeger.StdLogger),
		config.Metrics(metricsFactory),
	)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to initialize Jaeger tracer: %w", err)
	}

	// Set as global tracer
	opentracing.SetGlobalTracer(tracer)

	return tracer, closer, nil
}

// createJaegerConfig creates a Jaeger client configuration with specified parameters
func createJaegerConfig(opts *TracerOptions) (*config.Configuration, error) {
	if opts.ServiceName == "" {
		return nil, errors.New("service name cannot be empty")
	}

	cfg := &config.Configuration{
		ServiceName: opts.ServiceName,
		Sampler: &config.SamplerConfig{
			Type:  jaeger.SamplerTypeConst,
			Param: opts.SamplingRate,
		},
		Reporter: &config.ReporterConfig{
			LogSpans:            opts.LogSpans,
			BufferFlushInterval: opts.FlushInterval,
			LocalAgentHostPort:  opts.CollectorEndpoint,
			QueueSize:           opts.QueueSize,
			BufferSize:          opts.BufferSize,
		},
		Tags: []opentracing.Tag{
			{Key: "service.version", Value: "1.0.0"},
			{Key: "environment", Value: "production"},
		},
	}

	// Validate configuration
	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("invalid Jaeger configuration: %w", err)
	}

	return cfg, nil
}