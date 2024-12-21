// Package main provides the entry point for the monitoring service with comprehensive
// monitoring, metrics collection, and distributed tracing capabilities.
package main

import (
    "context"
    "log"
    "os"
    "os/signal"
    "sync"
    "syscall"
    "time"

    "src/backend/monitoring-service/internal/collectors"
    "src/backend/monitoring-service/internal/exporters"
    "src/backend/monitoring-service/internal/handlers"
    "src/backend/monitoring-service/internal/tracers"
)

const (
    // Service configuration
    defaultServiceName    = "monitoring-service"
    defaultSamplingRate  = 0.1
    shutdownTimeout      = 30 * time.Second
    healthCheckInterval  = 15 * time.Second
)

// main is the entry point of the monitoring service
func main() {
    // Initialize root context with cancellation
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    // Set up signal handling for graceful shutdown
    setupSignalHandler(cancel)

    // Initialize metrics collector
    metricsCollector := collectors.NewMetricsCollector()
    if err := metricsCollector.VerifyHealth(ctx); err != nil {
        log.Fatalf("Failed to initialize metrics collector: %v", err)
    }

    // Initialize Prometheus exporter
    prometheusExporter, err := exporters.NewPrometheusExporter(metricsCollector)
    if err != nil {
        log.Fatalf("Failed to create Prometheus exporter: %v", err)
    }

    // Initialize health handler
    healthHandler := handlers.NewHealthHandler(metricsCollector, handlers.Options{
        Timeout:   5 * time.Second,
        RateLimit: 100,
        Version:   "1.0.0",
    })

    // Initialize Jaeger tracer
    tracer, tracerCloser, err := tracers.NewJaegerTracer(
        defaultServiceName,
        defaultSamplingRate,
    )
    if err != nil {
        log.Fatalf("Failed to initialize Jaeger tracer: %v", err)
    }
    defer tracerCloser.Close()

    // Create wait group for coordinated shutdown
    var wg sync.WaitGroup

    // Start Prometheus metrics server
    wg.Add(1)
    go func() {
        defer wg.Done()
        if err := prometheusExporter.Start(ctx); err != nil {
            log.Printf("Prometheus exporter error: %v", err)
            cancel() // Trigger shutdown on critical error
        }
    }()

    // Start periodic health checks
    wg.Add(1)
    go func() {
        defer wg.Done()
        ticker := time.NewTicker(healthCheckInterval)
        defer ticker.Stop()

        for {
            select {
            case <-ctx.Done():
                return
            case <-ticker.C:
                if err := metricsCollector.VerifyHealth(ctx); err != nil {
                    log.Printf("Health check failed: %v", err)
                    // Don't cancel context here as temporary health check failures 
                    // shouldn't bring down the service
                }
            }
        }
    }()

    // Wait for shutdown signal
    <-ctx.Done()
    log.Println("Shutdown signal received, initiating graceful shutdown...")

    // Create shutdown context with timeout
    shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), shutdownTimeout)
    defer shutdownCancel()

    // Initiate graceful shutdown of components
    shutdownChan := make(chan struct{})
    go func() {
        defer close(shutdownChan)

        // Shutdown components in order
        if err := prometheusExporter.Shutdown(shutdownCtx); err != nil {
            log.Printf("Error shutting down Prometheus exporter: %v", err)
        }

        if err := metricsCollector.Shutdown(shutdownCtx); err != nil {
            log.Printf("Error shutting down metrics collector: %v", err)
        }

        // Wait for all goroutines to complete
        wg.Wait()
    }()

    // Wait for shutdown completion or timeout
    select {
    case <-shutdownChan:
        log.Println("Graceful shutdown completed")
    case <-shutdownCtx.Done():
        log.Println("Shutdown timed out")
    }
}

// setupSignalHandler configures signal handling for graceful shutdown
func setupSignalHandler(cancel context.CancelFunc) {
    sigChan := make(chan os.Signal, 1)
    signal.Notify(sigChan, syscall.SIGTERM, syscall.SIGINT, syscall.SIGQUIT)

    go func() {
        sig := <-sigChan
        log.Printf("Received signal: %v", sig)
        cancel()
    }()
}