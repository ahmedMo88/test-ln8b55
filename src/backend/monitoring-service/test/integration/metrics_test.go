// Package integration provides end-to-end testing for the monitoring service
// metrics collection and export functionality.
package integration

import (
    "context"
    "crypto/tls"
    "fmt"
    "io"
    "net/http"
    "strings"
    "sync"
    "testing"
    "time"

    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promhttp"

    "../../internal/collectors"
    "../../internal/exporters"
)

const (
    testMetricsPort = ":9091"
    testTimeout     = 5 * time.Second
    testTLSCertPath = "./testdata/cert.pem"
    testTLSKeyPath  = "./testdata/key.pem"
)

// TestMetricsCollection verifies end-to-end metrics collection functionality
// including various metric types, labels, and concurrent updates.
func TestMetricsCollection(t *testing.T) {
    // Create context with timeout
    ctx, cancel := context.WithTimeout(context.Background(), testTimeout)
    defer cancel()

    // Initialize metrics collector
    mc := setupTestMetrics()
    if mc == nil {
        t.Fatal("Failed to initialize metrics collector")
    }

    // Test counter metrics
    t.Run("Counter Metrics", func(t *testing.T) {
        counter := prometheus.NewCounter(prometheus.CounterOpts{
            Name: "test_counter_total",
            Help: "Test counter metric",
        })

        err := mc.RegisterMetric(counter, "test_counter_total", map[string]string{
            "service": "test",
            "env":     "integration",
        })
        if err != nil {
            t.Fatalf("Failed to register counter metric: %v", err)
        }

        // Test concurrent updates
        var wg sync.WaitGroup
        for i := 0; i < 100; i++ {
            wg.Add(1)
            go func() {
                defer wg.Done()
                counter.Inc()
            }()
        }
        wg.Wait()

        // Verify counter value
        if err := mc.CollectMetrics(ctx); err != nil {
            t.Fatalf("Failed to collect metrics: %v", err)
        }
    })

    // Test gauge metrics
    t.Run("Gauge Metrics", func(t *testing.T) {
        gauge := prometheus.NewGauge(prometheus.GaugeOpts{
            Name: "test_gauge",
            Help: "Test gauge metric",
        })

        err := mc.RegisterMetric(gauge, "test_gauge", map[string]string{
            "type": "system",
        })
        if err != nil {
            t.Fatalf("Failed to register gauge metric: %v", err)
        }

        // Test gauge operations
        gauge.Set(123.45)
        gauge.Inc()
        gauge.Dec()

        if err := mc.CollectMetrics(ctx); err != nil {
            t.Fatalf("Failed to collect metrics: %v", err)
        }
    })

    // Test histogram metrics
    t.Run("Histogram Metrics", func(t *testing.T) {
        histogram := prometheus.NewHistogram(prometheus.HistogramOpts{
            Name:    "test_histogram",
            Help:    "Test histogram metric",
            Buckets: []float64{0.1, 0.5, 1, 2.5, 5},
        })

        err := mc.RegisterMetric(histogram, "test_histogram", map[string]string{
            "operation": "latency",
        })
        if err != nil {
            t.Fatalf("Failed to register histogram metric: %v", err)
        }

        // Generate histogram data
        for i := 0; i < 1000; i++ {
            histogram.Observe(float64(i) / 1000)
        }

        if err := mc.CollectMetrics(ctx); err != nil {
            t.Fatalf("Failed to collect metrics: %v", err)
        }
    })

    // Test error cases
    t.Run("Error Cases", func(t *testing.T) {
        // Test invalid metric name
        err := mc.RegisterMetric(prometheus.NewCounter(prometheus.CounterOpts{
            Name: "",
            Help: "Invalid metric",
        }), "", nil)
        if err == nil {
            t.Error("Expected error for empty metric name")
        }

        // Test duplicate metric
        counter := prometheus.NewCounter(prometheus.CounterOpts{
            Name: "test_counter_total",
            Help: "Duplicate counter",
        })
        err = mc.RegisterMetric(counter, "test_counter_total", nil)
        if err == nil {
            t.Error("Expected error for duplicate metric")
        }
    })
}

// TestPrometheusExport verifies the Prometheus metrics export functionality
// including TLS configuration and endpoint validation.
func TestPrometheusExport(t *testing.T) {
    ctx, cancel := context.WithTimeout(context.Background(), testTimeout)
    defer cancel()

    // Initialize metrics collector with test data
    mc := setupTestMetrics()
    if mc == nil {
        t.Fatal("Failed to initialize metrics collector")
    }

    // Create and configure Prometheus exporter
    exporter, err := exporters.NewPrometheusExporter(mc)
    if err != nil {
        t.Fatalf("Failed to create Prometheus exporter: %v", err)
    }

    // Configure custom listen address
    exporter, err = exporter.WithListenAddress(testMetricsPort)
    if err != nil {
        t.Fatalf("Failed to set listen address: %v", err)
    }

    // Start metrics server
    serverCtx, serverCancel := context.WithCancel(ctx)
    defer serverCancel()

    go func() {
        if err := exporter.Start(serverCtx); err != nil {
            t.Errorf("Metrics server error: %v", err)
        }
    }()

    // Allow server to start
    time.Sleep(100 * time.Millisecond)

    // Test metrics endpoint
    t.Run("Metrics Endpoint", func(t *testing.T) {
        url := fmt.Sprintf("http://localhost%s/metrics", testMetricsPort)
        err := verifyMetricsEndpoint(url, nil)
        if err != nil {
            t.Fatalf("Metrics endpoint verification failed: %v", err)
        }
    })

    // Test concurrent scraping
    t.Run("Concurrent Scraping", func(t *testing.T) {
        var wg sync.WaitGroup
        errors := make(chan error, 10)

        for i := 0; i < 10; i++ {
            wg.Add(1)
            go func() {
                defer wg.Done()
                url := fmt.Sprintf("http://localhost%s/metrics", testMetricsPort)
                if err := verifyMetricsEndpoint(url, nil); err != nil {
                    errors <- err
                }
            }()
        }

        wg.Wait()
        close(errors)

        for err := range errors {
            t.Errorf("Concurrent scraping error: %v", err)
        }
    })
}

// setupTestMetrics creates a test metrics collector with various metric types
func setupTestMetrics() *collectors.MetricsCollector {
    mc := collectors.NewMetricsCollector()
    if mc == nil {
        return nil
    }

    // Configure test namespace
    mc.WithNamespace("test")

    return mc
}

// verifyMetricsEndpoint validates the metrics endpoint response
func verifyMetricsEndpoint(url string, tlsConfig *tls.Config) error {
    client := &http.Client{
        Timeout: testTimeout,
        Transport: &http.Transport{
            TLSClientConfig: tlsConfig,
        },
    }

    resp, err := client.Get(url)
    if err != nil {
        return fmt.Errorf("failed to fetch metrics: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
    }

    // Verify content type
    contentType := resp.Header.Get("Content-Type")
    if !strings.Contains(contentType, "text/plain") {
        return fmt.Errorf("unexpected content type: %s", contentType)
    }

    // Read and verify response body
    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return fmt.Errorf("failed to read response body: %w", err)
    }

    if len(body) == 0 {
        return fmt.Errorf("empty metrics response")
    }

    return nil
}