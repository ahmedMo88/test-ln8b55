// Package core provides the core workflow execution engine components
package core

import (
    "context"
    "errors"
    "sync"
    "time"
    
    "github.com/google/uuid"         // v1.3.0
    "github.com/prometheus/client_golang/prometheus" // v1.16.0
    "github.com/opentracing/opentracing-go"         // v1.2.0
    "github.com/sony/gobreaker"      // v0.5.0
    
    "internal/models"
)

// Common errors
var (
    ErrWorkflowNotFound = errors.New("workflow not found")
    ErrInvalidOperation = errors.New("invalid workflow operation")
    ErrExecutionTimeout = errors.New("workflow execution timeout")
)

// Metrics collectors
var (
    workflowExecutionTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "workflow_execution_total",
            Help: "Total number of workflow executions",
        },
        []string{"status", "type"},
    )

    workflowExecutionDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name: "workflow_execution_duration_seconds",
            Help: "Duration of workflow executions",
            Buckets: []float64{0.1, 0.5, 1, 2, 5, 10, 30},
        },
        []string{"status", "type"},
    )

    workflowHealthStatus = prometheus.NewGaugeVec(
        prometheus.GaugeOpts{
            Name: "workflow_health_status",
            Help: "Health status of workflow engine",
        },
        []string{"component"},
    )
)

// engineContext holds the state for a workflow engine instance
type engineContext struct {
    workflow    *models.Workflow
    status      string
    startTime   time.Time
    lastUpdated time.Time
    metadata    map[string]interface{}
    span        opentracing.Span
}

// EngineConfig holds configuration for the workflow engine
type EngineConfig struct {
    ExecutionTimeout    time.Duration
    MaxRetries         int
    CircuitBreakerName string
    CircuitBreakerConfig gobreaker.Settings
}

// Engine manages workflow execution with enhanced reliability and observability
type Engine struct {
    mu              sync.RWMutex
    executor        *Executor
    scheduler       *Scheduler
    activeWorkflows map[uuid.UUID]*engineContext
    breaker         *gobreaker.CircuitBreaker
    metricsRegistry *prometheus.Registry
    tracer          opentracing.Tracer
}

// NewEngine creates a new workflow engine instance with the provided configuration
func NewEngine(executor *Executor, scheduler *Scheduler, config EngineConfig) *Engine {
    if config.ExecutionTimeout == 0 {
        config.ExecutionTimeout = 5 * time.Minute
    }

    // Configure circuit breaker
    if config.CircuitBreakerName == "" {
        config.CircuitBreakerName = "workflow-engine"
    }
    
    breaker := gobreaker.NewCircuitBreaker(config.CircuitBreakerConfig)

    engine := &Engine{
        executor:        executor,
        scheduler:       scheduler,
        activeWorkflows: make(map[uuid.UUID]*engineContext),
        breaker:         breaker,
        metricsRegistry: prometheus.NewRegistry(),
        tracer:          opentracing.GlobalTracer(),
    }

    // Register metrics
    engine.metricsRegistry.MustRegister(workflowExecutionTotal)
    engine.metricsRegistry.MustRegister(workflowExecutionDuration)
    engine.metricsRegistry.MustRegister(workflowHealthStatus)

    // Initialize health status
    workflowHealthStatus.WithLabelValues("engine").Set(1)

    return engine
}

// StartWorkflow initiates workflow execution with comprehensive monitoring
func (e *Engine) StartWorkflow(ctx context.Context, workflowID uuid.UUID, opts map[string]interface{}) error {
    span, ctx := opentracing.StartSpanFromContext(ctx, "StartWorkflow")
    defer span.Finish()

    span.SetTag("workflow_id", workflowID)
    startTime := time.Now()

    // Execute with circuit breaker
    _, err := e.breaker.Execute(func() (interface{}, error) {
        return nil, e.executeWorkflow(ctx, workflowID, opts)
    })

    // Record metrics
    duration := time.Since(startTime).Seconds()
    status := "success"
    if err != nil {
        status = "failed"
    }
    workflowExecutionDuration.WithLabelValues(status, "start").Observe(duration)
    workflowExecutionTotal.WithLabelValues(status, "start").Inc()

    return err
}

// executeWorkflow handles the core workflow execution logic
func (e *Engine) executeWorkflow(ctx context.Context, workflowID uuid.UUID, opts map[string]interface{}) error {
    e.mu.Lock()
    if _, exists := e.activeWorkflows[workflowID]; exists {
        e.mu.Unlock()
        return errors.New("workflow already running")
    }

    engineCtx := &engineContext{
        status:    "running",
        startTime: time.Now(),
        metadata:  opts,
    }
    e.activeWorkflows[workflowID] = engineCtx
    e.mu.Unlock()

    defer func() {
        e.mu.Lock()
        delete(e.activeWorkflows, workflowID)
        e.mu.Unlock()
    }()

    // Execute workflow
    err := e.executor.ExecuteWorkflow(ctx, engineCtx.workflow)
    if err != nil {
        engineCtx.status = "failed"
        return err
    }

    engineCtx.status = "completed"
    return nil
}

// StopWorkflow gracefully stops workflow execution
func (e *Engine) StopWorkflow(ctx context.Context, workflowID uuid.UUID) error {
    span, _ := opentracing.StartSpanFromContext(ctx, "StopWorkflow")
    defer span.Finish()

    e.mu.RLock()
    engineCtx, exists := e.activeWorkflows[workflowID]
    e.mu.RUnlock()

    if !exists {
        return ErrWorkflowNotFound
    }

    return e.executor.CancelExecution(workflowID)
}

// ScheduleWorkflow schedules a workflow for execution
func (e *Engine) ScheduleWorkflow(ctx context.Context, workflowID uuid.UUID, scheduleConfig map[string]interface{}) error {
    span, ctx := opentracing.StartSpanFromContext(ctx, "ScheduleWorkflow")
    defer span.Finish()

    e.mu.RLock()
    engineCtx, exists := e.activeWorkflows[workflowID]
    e.mu.RUnlock()

    if !exists {
        return ErrWorkflowNotFound
    }

    return e.scheduler.ScheduleWorkflow(ctx, engineCtx.workflow, scheduleConfig)
}

// GetWorkflowStatus retrieves the current status of a workflow
func (e *Engine) GetWorkflowStatus(workflowID uuid.UUID) (string, error) {
    e.mu.RLock()
    defer e.mu.RUnlock()

    engineCtx, exists := e.activeWorkflows[workflowID]
    if !exists {
        return "", ErrWorkflowNotFound
    }

    return engineCtx.status, nil
}

// GetHealth returns the health status of the workflow engine
func (e *Engine) GetHealth() map[string]interface{} {
    health := map[string]interface{}{
        "status":           "healthy",
        "active_workflows": len(e.activeWorkflows),
        "circuit_breaker": map[string]interface{}{
            "state":     e.breaker.State().String(),
            "failures": e.breaker.Counts().Failures,
        },
    }

    return health
}

// validateWorkflowOperation validates workflow operations
func validateWorkflowOperation(workflow *models.Workflow, operation string, ctx context.Context) error {
    span, _ := opentracing.StartSpanFromContext(ctx, "ValidateWorkflowOperation")
    defer span.Finish()

    if workflow == nil {
        return ErrWorkflowNotFound
    }

    if err := workflow.Validate(); err != nil {
        return fmt.Errorf("workflow validation failed: %w", err)
    }

    // Validate operation based on current workflow status
    switch operation {
    case "start":
        if workflow.Status != "active" {
            return fmt.Errorf("%w: workflow must be active to start", ErrInvalidOperation)
        }
    case "stop":
        if workflow.Status != "running" {
            return fmt.Errorf("%w: workflow must be running to stop", ErrInvalidOperation)
        }
    case "schedule":
        if workflow.Status != "active" {
            return fmt.Errorf("%w: workflow must be active to schedule", ErrInvalidOperation)
        }
    }

    return nil
}