// Package core provides the core workflow execution engine components
package core

import (
    "context"
    "fmt"
    "sync"
    "time"
    
    "github.com/google/uuid"
    "github.com/prometheus/client_golang/prometheus"
    "github.com/opentracing/opentracing-go"
    "google.golang.org/grpc"
    
    "internal/models"
)

// ExecutionStatus represents the current status of a workflow execution
type ExecutionStatus string

const (
    // Execution status constants
    StatusPending   ExecutionStatus = "pending"
    StatusRunning   ExecutionStatus = "running"
    StatusCompleted ExecutionStatus = "completed"
    StatusFailed    ExecutionStatus = "failed"
    StatusCanceled  ExecutionStatus = "canceled"

    // Default timeout for workflow execution
    defaultExecutionTimeout = 5 * time.Minute
    maxConcurrentExecutions = 1000
)

// Metrics collectors
var (
    nodeExecutionTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "workflow_node_execution_total",
            Help: "Total number of node executions",
        },
        []string{"node_type", "status"},
    )

    nodeExecutionDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name: "workflow_node_execution_duration_seconds",
            Help: "Duration of node executions in seconds",
            Buckets: []float64{0.1, 0.5, 1, 2, 5, 10, 30},
        },
        []string{"node_type"},
    )

    activeExecutions = prometheus.NewGauge(
        prometheus.GaugeOpts{
            Name: "workflow_active_executions",
            Help: "Number of currently active workflow executions",
        },
    )
)

// executionContext holds the state for a single workflow execution
type executionContext struct {
    workflowID uuid.UUID
    status     ExecutionStatus
    startTime  time.Time
    nodeStates map[uuid.UUID]*nodeState
    results    map[uuid.UUID]interface{}
    errors     []error
    ctx        context.Context
    cancel     context.CancelFunc
    mu         sync.RWMutex
}

// nodeState tracks the execution state of a single node
type nodeState struct {
    status    ExecutionStatus
    startTime time.Time
    endTime   time.Time
    retries   int
    error     error
}

// NodeExecutor defines the interface for node type-specific executors
type NodeExecutor interface {
    Execute(ctx context.Context, node *models.Node, input map[string]interface{}) (map[string]interface{}, error)
    Validate(node *models.Node) error
}

// Executor manages workflow execution with observability and reliability features
type Executor struct {
    mu                     sync.RWMutex
    activeExecutions       map[uuid.UUID]*executionContext
    nodeExecutors         map[models.NodeType]NodeExecutor
    aiServiceConn         *grpc.ClientConn
    integrationServiceConn *grpc.ClientConn
    executionWg           sync.WaitGroup
    metricsRegistry       *prometheus.Registry
}

// NewExecutor creates a new workflow executor instance
func NewExecutor(aiConn, integrationConn *grpc.ClientConn) *Executor {
    e := &Executor{
        activeExecutions:       make(map[uuid.UUID]*executionContext),
        nodeExecutors:         make(map[models.NodeType]NodeExecutor),
        aiServiceConn:         aiConn,
        integrationServiceConn: integrationConn,
        metricsRegistry:       prometheus.NewRegistry(),
    }

    // Register metrics
    e.metricsRegistry.MustRegister(nodeExecutionTotal)
    e.metricsRegistry.MustRegister(nodeExecutionDuration)
    e.metricsRegistry.MustRegister(activeExecutions)

    // Initialize node executors
    e.registerNodeExecutors()

    // Start cleanup worker
    go e.cleanupWorker()

    return e
}

// ExecuteWorkflow orchestrates the execution of a complete workflow
func (e *Executor) ExecuteWorkflow(ctx context.Context, workflow *models.Workflow) error {
    span, ctx := opentracing.StartSpanFromContext(ctx, "ExecuteWorkflow")
    defer span.Finish()

    // Validate workflow
    if err := workflow.Validate(); err != nil {
        return fmt.Errorf("workflow validation failed: %w", err)
    }

    // Create execution context with timeout
    execCtx := e.createExecutionContext(ctx, workflow)
    
    // Register active execution
    e.mu.Lock()
    if len(e.activeExecutions) >= maxConcurrentExecutions {
        e.mu.Unlock()
        return fmt.Errorf("maximum concurrent executions reached")
    }
    e.activeExecutions[workflow.ID] = execCtx
    activeExecutions.Inc()
    e.mu.Unlock()

    defer func() {
        e.mu.Lock()
        delete(e.activeExecutions, workflow.ID)
        activeExecutions.Dec()
        e.mu.Unlock()
    }()

    // Build execution graph
    graph := e.buildExecutionGraph(workflow.Nodes)
    
    // Execute nodes in dependency order
    err := e.executeGraph(execCtx, graph)
    if err != nil {
        execCtx.status = StatusFailed
        return fmt.Errorf("workflow execution failed: %w", err)
    }

    execCtx.status = StatusCompleted
    workflow.UpdateLastExecuted()
    
    return nil
}

// CancelExecution cancels an active workflow execution
func (e *Executor) CancelExecution(workflowID uuid.UUID) error {
    e.mu.RLock()
    execCtx, exists := e.activeExecutions[workflowID]
    e.mu.RUnlock()

    if !exists {
        return fmt.Errorf("no active execution found for workflow %s", workflowID)
    }

    execCtx.mu.Lock()
    if execCtx.status == StatusRunning {
        execCtx.cancel()
        execCtx.status = StatusCanceled
    }
    execCtx.mu.Unlock()

    return nil
}

// createExecutionContext initializes a new execution context
func (e *Executor) createExecutionContext(ctx context.Context, workflow *models.Workflow) *executionContext {
    timeout := defaultExecutionTimeout
    if workflow.ExecutionTimeout > 0 {
        timeout = workflow.ExecutionTimeout
    }

    ctx, cancel := context.WithTimeout(ctx, timeout)
    
    return &executionContext{
        workflowID: workflow.ID,
        status:     StatusPending,
        startTime:  time.Now(),
        nodeStates: make(map[uuid.UUID]*nodeState),
        results:    make(map[uuid.UUID]interface{}),
        errors:     make([]error, 0),
        ctx:        ctx,
        cancel:     cancel,
    }
}

// executeNode executes a single node with metrics and tracing
func (e *Executor) executeNode(ctx context.Context, node *models.Node, input map[string]interface{}) (map[string]interface{}, error) {
    span, ctx := opentracing.StartSpanFromContext(ctx, "ExecuteNode")
    defer span.Finish()

    span.SetTag("node_id", node.ID)
    span.SetTag("node_type", node.Type)

    startTime := time.Now()
    defer func() {
        duration := time.Since(startTime).Seconds()
        nodeExecutionDuration.WithLabelValues(string(node.Type)).Observe(duration)
    }()

    executor, exists := e.nodeExecutors[node.Type]
    if !exists {
        return nil, fmt.Errorf("no executor found for node type %s", node.Type)
    }

    result, err := executor.Execute(ctx, node, input)
    if err != nil {
        nodeExecutionTotal.WithLabelValues(string(node.Type), "failed").Inc()
        return nil, err
    }

    nodeExecutionTotal.WithLabelValues(string(node.Type), "success").Inc()
    return result, nil
}

// cleanupWorker periodically cleans up completed executions
func (e *Executor) cleanupWorker() {
    ticker := time.NewTicker(5 * time.Minute)
    defer ticker.Stop()

    for range ticker.C {
        e.mu.Lock()
        for id, exec := range e.activeExecutions {
            exec.mu.RLock()
            if exec.status == StatusCompleted || exec.status == StatusFailed {
                if time.Since(exec.startTime) > time.Hour {
                    delete(e.activeExecutions, id)
                    activeExecutions.Dec()
                }
            }
            exec.mu.RUnlock()
        }
        e.mu.Unlock()
    }
}

// registerNodeExecutors initializes the supported node executors
func (e *Executor) registerNodeExecutors() {
    // Register built-in node executors
    // Implementation details for specific node executors would be in separate files
}

// buildExecutionGraph creates a dependency graph of nodes
func (e *Executor) buildExecutionGraph(nodes []*models.Node) map[uuid.UUID][]*models.Node {
    graph := make(map[uuid.UUID][]*models.Node)
    
    for _, node := range nodes {
        for _, inputID := range node.GetInputConnections() {
            graph[inputID] = append(graph[inputID], node)
        }
    }
    
    return graph
}

// executeGraph executes nodes in the correct order based on dependencies
func (e *Executor) executeGraph(execCtx *executionContext, graph map[uuid.UUID][]*models.Node) error {
    // Implementation of topological sort and parallel execution
    // would go here based on the graph structure
    return nil
}