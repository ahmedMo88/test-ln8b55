// Package unit provides comprehensive unit tests for the monitoring service
// with focus on health check endpoints and reliability validation.
package unit

import (
    "context"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "sync"
    "testing"
    "time"

    "src/backend/monitoring-service/internal/handlers"
    "src/backend/monitoring-service/internal/collectors"
)

const (
    testTimeout        = 100 * time.Millisecond
    defaultTestTimeout = 5 * time.Second
)

var testDependencies = []string{"database", "cache", "messageQueue"}

// mockMetricsCollector implements collectors.MetricsCollector interface for testing
type mockMetricsCollector struct {
    shouldFail       bool
    delay           time.Duration
    dependencyStatus map[string]bool
    lock            sync.Mutex
}

// newMockMetricsCollector creates a new mock collector with default settings
func newMockMetricsCollector() *mockMetricsCollector {
    return &mockMetricsCollector{
        shouldFail:       false,
        delay:           0,
        dependencyStatus: make(map[string]bool),
        lock:            sync.Mutex{},
    }
}

// CollectMetrics implements the MetricsCollector interface with configurable behavior
func (m *mockMetricsCollector) CollectMetrics(ctx context.Context) error {
    m.lock.Lock()
    defer m.lock.Unlock()

    // Simulate configured delay
    if m.delay > 0 {
        select {
        case <-time.After(m.delay):
        case <-ctx.Done():
            return ctx.Err()
        }
    }

    if m.shouldFail {
        return &collectors.MetricError{Message: "metrics collection failed"}
    }
    return nil
}

// SetDelay configures artificial delay for timeout testing
func (m *mockMetricsCollector) SetDelay(d time.Duration) {
    m.lock.Lock()
    defer m.lock.Unlock()
    m.delay = d
}

// SetShouldFail configures the mock to simulate failures
func (m *mockMetricsCollector) SetShouldFail(fail bool) {
    m.lock.Lock()
    defer m.lock.Unlock()
    m.shouldFail = fail
}

// TestNewHealthHandler validates health handler creation and configuration
func TestNewHealthHandler(t *testing.T) {
    tests := []struct {
        name        string
        timeout     time.Duration
        expectPanic bool
    }{
        {
            name:        "Valid configuration with default timeout",
            timeout:     0,
            expectPanic: false,
        },
        {
            name:        "Valid configuration with custom timeout",
            timeout:     testTimeout,
            expectPanic: false,
        },
        {
            name:        "Nil metrics collector",
            timeout:     testTimeout,
            expectPanic: true,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            defer func() {
                if r := recover(); (r != nil) != tt.expectPanic {
                    t.Errorf("NewHealthHandler() panic = %v, expectPanic = %v", r, tt.expectPanic)
                }
            }()

            var collector *mockMetricsCollector
            if !tt.expectPanic {
                collector = newMockMetricsCollector()
            }

            h := handlers.NewHealthHandler(collector, handlers.Options{
                Timeout: tt.timeout,
            })

            if h == nil {
                t.Error("Expected non-nil handler")
            }
        })
    }
}

// TestHandleLiveness tests the liveness probe endpoint
func TestHandleLiveness(t *testing.T) {
    tests := []struct {
        name           string
        method         string
        expectedStatus int
    }{
        {
            name:           "Valid GET request",
            method:         http.MethodGet,
            expectedStatus: http.StatusOK,
        },
        {
            name:           "Invalid POST request",
            method:         http.MethodPost,
            expectedStatus: http.StatusMethodNotAllowed,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            collector := newMockMetricsCollector()
            h := handlers.NewHealthHandler(collector, handlers.Options{})

            req := httptest.NewRequest(tt.method, "/health/live", nil)
            w := httptest.NewRecorder()

            h.HandleLiveness(w, req)

            resp := w.Result()
            defer resp.Body.Close()

            if resp.StatusCode != tt.expectedStatus {
                t.Errorf("Expected status %d, got %d", tt.expectedStatus, resp.StatusCode)
            }

            if tt.expectedStatus == http.StatusOK {
                var response handlers.HealthResponse
                if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
                    t.Fatalf("Failed to decode response: %v", err)
                }

                if response.Status != "UP" {
                    t.Errorf("Expected status UP, got %s", response.Status)
                }

                if response.Timestamp.IsZero() {
                    t.Error("Expected non-zero timestamp")
                }
            }
        })
    }
}

// TestHandleReadiness tests the readiness probe endpoint
func TestHandleReadiness(t *testing.T) {
    tests := []struct {
        name           string
        shouldFail     bool
        delay          time.Duration
        timeout        time.Duration
        expectedStatus int
    }{
        {
            name:           "Successful readiness check",
            shouldFail:     false,
            delay:         0,
            timeout:       defaultTestTimeout,
            expectedStatus: http.StatusOK,
        },
        {
            name:           "Failed readiness check",
            shouldFail:     true,
            delay:         0,
            timeout:       defaultTestTimeout,
            expectedStatus: http.StatusServiceUnavailable,
        },
        {
            name:           "Timeout readiness check",
            shouldFail:     false,
            delay:         testTimeout * 2,
            timeout:       testTimeout,
            expectedStatus: http.StatusServiceUnavailable,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            collector := newMockMetricsCollector()
            collector.SetShouldFail(tt.shouldFail)
            collector.SetDelay(tt.delay)

            h := handlers.NewHealthHandler(collector, handlers.Options{
                Timeout: tt.timeout,
            })

            req := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
            w := httptest.NewRecorder()

            h.HandleReadiness(w, req)

            resp := w.Result()
            defer resp.Body.Close()

            if resp.StatusCode != tt.expectedStatus {
                t.Errorf("Expected status %d, got %d", tt.expectedStatus, resp.StatusCode)
            }

            var response handlers.HealthResponse
            if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
                t.Fatalf("Failed to decode response: %v", err)
            }

            expectedStatus := "UP"
            if tt.expectedStatus != http.StatusOK {
                expectedStatus = "DOWN"
            }

            if response.Status != expectedStatus {
                t.Errorf("Expected status %s, got %s", expectedStatus, response.Status)
            }

            if response.Timestamp.IsZero() {
                t.Error("Expected non-zero timestamp")
            }
        })
    }
}

// TestHandleReadinessTimeout tests timeout handling in readiness probe
func TestHandleReadinessTimeout(t *testing.T) {
    collector := newMockMetricsCollector()
    collector.SetDelay(testTimeout * 2)

    h := handlers.NewHealthHandler(collector, handlers.Options{
        Timeout: testTimeout,
    })

    req := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
    w := httptest.NewRecorder()

    start := time.Now()
    h.HandleReadiness(w, req)
    elapsed := time.Since(start)

    if elapsed >= testTimeout*2 {
        t.Errorf("Handler took too long to timeout: %v", elapsed)
    }

    resp := w.Result()
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusServiceUnavailable {
        t.Errorf("Expected status %d, got %d", http.StatusServiceUnavailable, resp.StatusCode)
    }

    var response handlers.HealthResponse
    if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
        t.Fatalf("Failed to decode response: %v", err)
    }

    if response.Status != "DOWN" {
        t.Errorf("Expected status DOWN, got %s", response.Status)
    }

    if !response.Checks["timeout"] {
        t.Error("Expected timeout check to be false")
    }
}