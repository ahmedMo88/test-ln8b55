// Package core provides the core workflow execution engine components
package core

import (
    "context"
    "errors"
    "fmt"
    "sync"
    "time"

    "github.com/google/uuid"          // v1.3.0
    "github.com/robfig/cron/v3"      // v3.0.1
    "github.com/cenkalti/backoff/v4" // v4.2.1
    "github.com/prometheus/client_golang/prometheus" // v1.16.0
    "github.com/opentracing/opentracing-go"         // v1.2.0

    "internal/models"
)

// Common errors
var (
    ErrScheduleNotFound   = errors.New("schedule not found")
    ErrInvalidSchedule    = errors.New("invalid schedule configuration")
    ErrScheduleConflict   = errors.New("schedule already exists for workflow")
)

// Metrics collectors
var (
    scheduledWorkflowTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "scheduled_workflow_total",
            Help: "Total number of scheduled workflows",
        },
        []string{"status", "type"},
    )

    scheduledWorkflowExecutionTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "scheduled_workflow_execution_total",
            Help: "Total number of scheduled workflow executions",
        },
        []string{"status", "type"},
    )

    scheduledWorkflowLatency = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name: "scheduled_workflow_latency_seconds",
            Help: "Latency of scheduled workflow executions",
            Buckets: []float64{0.1, 0.5, 1, 2, 5, 10, 30},
        },
        []string{"type"},
    )
)

// scheduleContext holds the state for a scheduled workflow
type scheduleContext struct {
    workflow     *models.Workflow
    config       map[string]interface{}
    cronID       cron.EntryID
    timer        *time.Timer
    lastRun      time.Time
    nextRun      time.Time
    retryBackoff *backoff.ExponentialBackOff
    span         opentracing.Span
    cancel       context.CancelFunc
}

// SchedulerConfig holds configuration for the scheduler
type SchedulerConfig struct {
    Location          *time.Location
    MaxRetries        int
    RetryInitialWait  time.Duration
    RetryMaxWait      time.Duration
    MaintenanceInterval time.Duration
}

// Scheduler manages workflow scheduling with enhanced reliability and observability
type Scheduler struct {
    mu              *sync.RWMutex
    cronScheduler   *cron.Cron
    executor        *Executor
    activeSchedules map[uuid.UUID]*scheduleContext
    ctx             context.Context
    cancel          context.CancelFunc
    backoff         *backoff.ExponentialBackOff
    maintenance     chan struct{}
}

// NewScheduler creates a new scheduler instance with the provided configuration
func NewScheduler(executor *Executor, config SchedulerConfig) *Scheduler {
    if config.Location == nil {
        config.Location = time.UTC
    }

    ctx, cancel := context.WithCancel(context.Background())
    
    cronOptions := cron.WithLocation(config.Location)
    scheduler := &Scheduler{
        mu:              &sync.RWMutex{},
        cronScheduler:   cron.New(cronOptions),
        executor:        executor,
        activeSchedules: make(map[uuid.UUID]*scheduleContext),
        ctx:            ctx,
        cancel:         cancel,
        maintenance:    make(chan struct{}),
    }

    // Configure default backoff
    scheduler.backoff = backoff.NewExponentialBackOff()
    scheduler.backoff.InitialInterval = config.RetryInitialWait
    scheduler.backoff.MaxInterval = config.RetryMaxWait
    scheduler.backoff.MaxElapsedTime = 0 // Never stop retrying

    // Register metrics
    prometheus.MustRegister(scheduledWorkflowTotal)
    prometheus.MustRegister(scheduledWorkflowExecutionTotal)
    prometheus.MustRegister(scheduledWorkflowLatency)

    // Start maintenance worker
    go scheduler.maintenanceWorker(config.MaintenanceInterval)

    return scheduler
}

// ScheduleWorkflow schedules a workflow for execution with the provided configuration
func (s *Scheduler) ScheduleWorkflow(ctx context.Context, workflow *models.Workflow, scheduleConfig map[string]interface{}) error {
    span, ctx := opentracing.StartSpanFromContext(ctx, "ScheduleWorkflow")
    defer span.Finish()

    span.SetTag("workflow_id", workflow.ID)

    // Validate schedule configuration
    if err := s.validateScheduleConfig(scheduleConfig); err != nil {
        return fmt.Errorf("invalid schedule configuration: %w", err)
    }

    s.mu.Lock()
    defer s.mu.Unlock()

    // Check for existing schedule
    if _, exists := s.activeSchedules[workflow.ID]; exists {
        return ErrScheduleConflict
    }

    // Create schedule context
    schedCtx := &scheduleContext{
        workflow: workflow,
        config:   scheduleConfig,
        retryBackoff: s.backoff.Clone(),
        span:     span,
    }

    // Handle different schedule types
    scheduleType := scheduleConfig["type"].(string)
    switch scheduleType {
    case "cron":
        cronExpr := scheduleConfig["cron"].(string)
        entryID, err := s.cronScheduler.AddFunc(cronExpr, func() {
            s.executeScheduledWorkflow(workflow.ID)
        })
        if err != nil {
            return fmt.Errorf("failed to add cron schedule: %w", err)
        }
        schedCtx.cronID = entryID

    case "interval":
        interval := time.Duration(scheduleConfig["interval"].(float64)) * time.Second
        timer := time.NewTimer(interval)
        schedCtx.timer = timer
        go s.handleIntervalSchedule(workflow.ID, interval, timer)

    default:
        return fmt.Errorf("%w: unsupported schedule type", ErrInvalidSchedule)
    }

    s.activeSchedules[workflow.ID] = schedCtx
    scheduledWorkflowTotal.WithLabelValues("active", scheduleType).Inc()

    // Update workflow metadata
    workflow.Metadata["scheduled"] = true
    workflow.Metadata["schedule_type"] = scheduleType
    workflow.Metadata["schedule_config"] = scheduleConfig

    return nil
}

// UnscheduleWorkflow removes scheduling for a workflow
func (s *Scheduler) UnscheduleWorkflow(ctx context.Context, workflowID uuid.UUID) error {
    span, _ := opentracing.StartSpanFromContext(ctx, "UnscheduleWorkflow")
    defer span.Finish()

    s.mu.Lock()
    defer s.mu.Unlock()

    schedCtx, exists := s.activeSchedules[workflowID]
    if !exists {
        return ErrScheduleNotFound
    }

    // Clean up based on schedule type
    if schedCtx.cronID != 0 {
        s.cronScheduler.Remove(schedCtx.cronID)
    }
    if schedCtx.timer != nil {
        schedCtx.timer.Stop()
    }
    if schedCtx.cancel != nil {
        schedCtx.cancel()
    }

    delete(s.activeSchedules, workflowID)
    scheduledWorkflowTotal.WithLabelValues("removed", schedCtx.config["type"].(string)).Inc()

    // Update workflow metadata
    schedCtx.workflow.Metadata["scheduled"] = false
    delete(schedCtx.workflow.Metadata, "schedule_type")
    delete(schedCtx.workflow.Metadata, "schedule_config")

    return nil
}

// Start begins the scheduler operation
func (s *Scheduler) Start() {
    s.cronScheduler.Start()
}

// Stop gracefully shuts down the scheduler
func (s *Scheduler) Stop() {
    s.cancel()
    s.cronScheduler.Stop()
    close(s.maintenance)

    // Clean up all active schedules
    s.mu.Lock()
    defer s.mu.Unlock()

    for _, schedCtx := range s.activeSchedules {
        if schedCtx.timer != nil {
            schedCtx.timer.Stop()
        }
        if schedCtx.cancel != nil {
            schedCtx.cancel()
        }
    }
}

// executeScheduledWorkflow handles the execution of a scheduled workflow
func (s *Scheduler) executeScheduledWorkflow(workflowID uuid.UUID) {
    s.mu.RLock()
    schedCtx, exists := s.activeSchedules[workflowID]
    s.mu.RUnlock()

    if !exists {
        return
    }

    startTime := time.Now()
    scheduleType := schedCtx.config["type"].(string)

    // Create execution context
    ctx, cancel := context.WithCancel(s.ctx)
    schedCtx.cancel = cancel

    // Execute workflow with tracing and metrics
    err := s.executor.ExecuteWorkflow(ctx, schedCtx.workflow)
    duration := time.Since(startTime).Seconds()

    if err != nil {
        scheduledWorkflowExecutionTotal.WithLabelValues("failed", scheduleType).Inc()
        s.handleExecutionError(schedCtx, err)
    } else {
        scheduledWorkflowExecutionTotal.WithLabelValues("success", scheduleType).Inc()
        schedCtx.retryBackoff.Reset() // Reset backoff on success
    }

    scheduledWorkflowLatency.WithLabelValues(scheduleType).Observe(duration)
    schedCtx.lastRun = startTime
}

// handleIntervalSchedule manages interval-based scheduling
func (s *Scheduler) handleIntervalSchedule(workflowID uuid.UUID, interval time.Duration, timer *time.Timer) {
    for {
        select {
        case <-s.ctx.Done():
            return
        case <-timer.C:
            s.executeScheduledWorkflow(workflowID)
            timer.Reset(interval)
        }
    }
}

// handleExecutionError manages workflow execution errors with retry logic
func (s *Scheduler) handleExecutionError(schedCtx *scheduleContext, err error) {
    nextRetry := schedCtx.retryBackoff.NextBackOff()
    if nextRetry == backoff.Stop {
        schedCtx.span.LogKV("error", "max retries exceeded", "workflow_id", schedCtx.workflow.ID)
        return
    }

    time.AfterFunc(nextRetry, func() {
        s.executeScheduledWorkflow(schedCtx.workflow.ID)
    })
}

// maintenanceWorker performs periodic maintenance tasks
func (s *Scheduler) maintenanceWorker(interval time.Duration) {
    ticker := time.NewTicker(interval)
    defer ticker.Stop()

    for {
        select {
        case <-s.ctx.Done():
            return
        case <-ticker.C:
            s.performMaintenance()
        case <-s.maintenance:
            return
        }
    }
}

// performMaintenance handles maintenance tasks for the scheduler
func (s *Scheduler) performMaintenance() {
    s.mu.Lock()
    defer s.mu.Unlock()

    now := time.Now()
    for id, schedCtx := range s.activeSchedules {
        // Check for stale schedules
        if schedCtx.lastRun.Add(24 * time.Hour).Before(now) {
            schedCtx.span.LogKV("warning", "stale schedule detected", "workflow_id", id)
        }

        // Update next run time for cron schedules
        if schedCtx.cronID != 0 {
            entry := s.cronScheduler.Entry(schedCtx.cronID)
            schedCtx.nextRun = entry.Next
        }
    }
}

// validateScheduleConfig validates the schedule configuration
func (s *Scheduler) validateScheduleConfig(config map[string]interface{}) error {
    if config == nil {
        return fmt.Errorf("%w: configuration is required", ErrInvalidSchedule)
    }

    scheduleType, ok := config["type"].(string)
    if !ok {
        return fmt.Errorf("%w: schedule type is required", ErrInvalidSchedule)
    }

    switch scheduleType {
    case "cron":
        cronExpr, ok := config["cron"].(string)
        if !ok {
            return fmt.Errorf("%w: cron expression is required", ErrInvalidSchedule)
        }
        if _, err := cron.ParseStandard(cronExpr); err != nil {
            return fmt.Errorf("%w: invalid cron expression: %v", ErrInvalidSchedule, err)
        }

    case "interval":
        interval, ok := config["interval"].(float64)
        if !ok {
            return fmt.Errorf("%w: interval is required", ErrInvalidSchedule)
        }
        if interval < 1 {
            return fmt.Errorf("%w: interval must be greater than 0", ErrInvalidSchedule)
        }

    default:
        return fmt.Errorf("%w: unsupported schedule type: %s", ErrInvalidSchedule, scheduleType)
    }

    return nil
}