// Package integration provides integration tests for the workflow engine
package integration

import (
    "context"
    "testing"
    "time"

    "github.com/google/uuid"                    // v1.3.0
    "github.com/stretchr/testify/require"       // v1.8.4
    "github.com/stretchr/testify/mock"          // v1.8.4
    "go.opentelemetry.io/otel/trace"            // v1.19.0
    "github.com/prometheus/client_golang/prometheus" // v1.16.0

    "internal/core"
    "internal/models"
)

// testSuite encapsulates the test environment
type testSuite struct {
    engine           *core.Engine
    executor         *mock.Mock
    scheduler        *mock.Mock
    tracer          *mock.Mock
    metricsRegistry *prometheus.Registry
    ctx             context.Context
    cancel          context.CancelFunc
}

// setupTestSuite initializes a new test suite
func setupTestSuite(t *testing.T) *testSuite {
    // Initialize context with timeout
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)

    // Create mock executor
    executorMock := new(mock.Mock)
    executorMock.On("ExecuteWorkflow", mock.Anything, mock.Anything).Return(nil)

    // Create mock scheduler
    schedulerMock := new(mock.Mock)
    schedulerMock.On("ScheduleWorkflow", mock.Anything, mock.Anything, mock.Anything).Return(nil)

    // Create mock tracer
    tracerMock := new(mock.Mock)
    tracerMock.On("StartSpan", mock.Anything).Return(trace.SpanContext{})

    // Initialize metrics registry
    registry := prometheus.NewRegistry()

    // Create engine configuration
    engineConfig := core.EngineConfig{
        ExecutionTimeout: 5 * time.Second,
        MaxRetries:      3,
    }

    // Initialize engine with mocks
    engine := core.NewEngine(executorMock, schedulerMock, engineConfig)

    return &testSuite{
        engine:           engine,
        executor:         executorMock,
        scheduler:        schedulerMock,
        tracer:          tracerMock,
        metricsRegistry: registry,
        ctx:             ctx,
        cancel:          cancel,
    }
}

// cleanup performs test cleanup
func (ts *testSuite) cleanup() {
    ts.cancel()
    ts.executor.AssertExpectations(nil)
    ts.scheduler.AssertExpectations(nil)
    ts.tracer.AssertExpectations(nil)
}

// TestEngineStartWorkflow tests workflow execution with comprehensive validation
func TestEngineStartWorkflow(t *testing.T) {
    // Initialize test suite
    ts := setupTestSuite(t)
    defer ts.cleanup()

    // Create test workflow
    workflow, err := createTestWorkflow()
    require.NoError(t, err, "Failed to create test workflow")

    // Set up execution expectations
    ts.executor.On("ExecuteWorkflow", mock.Anything, workflow).Return(nil)

    // Test cases
    testCases := []struct {
        name          string
        workflow      *models.Workflow
        expectError   bool
        setupMocks    func()
        validateState func(*testing.T, error)
    }{
        {
            name:        "Successful workflow execution",
            workflow:    workflow,
            expectError: false,
            setupMocks: func() {
                ts.executor.On("GetMetrics").Return(map[string]float64{
                    "execution_time": 1.5,
                    "node_count":    3,
                })
            },
            validateState: func(t *testing.T, err error) {
                require.NoError(t, err)
                status, err := ts.engine.GetWorkflowStatus(workflow.ID)
                require.NoError(t, err)
                require.Equal(t, "completed", status)
            },
        },
        {
            name:        "Execution timeout",
            workflow:    workflow,
            expectError: true,
            setupMocks: func() {
                // Simulate timeout by sleeping longer than execution timeout
                ts.executor.On("ExecuteWorkflow", mock.Anything, workflow).After(6*time.Second).Return(core.ErrExecutionTimeout)
            },
            validateState: func(t *testing.T, err error) {
                require.Error(t, err)
                require.ErrorIs(t, err, core.ErrExecutionTimeout)
            },
        },
    }

    // Execute test cases
    for _, tc := range testCases {
        t.Run(tc.name, func(t *testing.T) {
            // Setup test case
            tc.setupMocks()

            // Execute workflow
            err := ts.engine.StartWorkflow(ts.ctx, tc.workflow.ID, nil)

            // Validate results
            tc.validateState(t, err)

            // Verify metrics
            metrics, err := ts.engine.GetMetrics()
            require.NoError(t, err)
            require.NotNil(t, metrics)

            // Verify traces
            spans := ts.tracer.Calls
            require.NotEmpty(t, spans)
        })
    }
}

// TestEngineStopWorkflow tests workflow cancellation
func TestEngineStopWorkflow(t *testing.T) {
    // Initialize test suite
    ts := setupTestSuite(t)
    defer ts.cleanup()

    // Create and start test workflow
    workflow, err := createTestWorkflow()
    require.NoError(t, err, "Failed to create test workflow")

    // Set up execution expectations
    ts.executor.On("ExecuteWorkflow", mock.Anything, workflow).Return(nil)
    ts.executor.On("CancelExecution", workflow.ID).Return(nil)

    // Start workflow
    err = ts.engine.StartWorkflow(ts.ctx, workflow.ID, nil)
    require.NoError(t, err, "Failed to start workflow")

    // Test cases
    testCases := []struct {
        name          string
        workflow      *models.Workflow
        expectError   bool
        setupMocks    func()
        validateState func(*testing.T, error)
    }{
        {
            name:        "Successful workflow stop",
            workflow:    workflow,
            expectError: false,
            setupMocks: func() {
                ts.executor.On("GetMetrics").Return(map[string]float64{
                    "execution_time": 0.5,
                })
            },
            validateState: func(t *testing.T, err error) {
                require.NoError(t, err)
                status, err := ts.engine.GetWorkflowStatus(workflow.ID)
                require.NoError(t, err)
                require.Equal(t, "canceled", status)
            },
        },
        {
            name:        "Stop non-existent workflow",
            workflow:    &models.Workflow{ID: uuid.New()},
            expectError: true,
            setupMocks:  func() {},
            validateState: func(t *testing.T, err error) {
                require.Error(t, err)
                require.ErrorIs(t, err, core.ErrWorkflowNotFound)
            },
        },
    }

    // Execute test cases
    for _, tc := range testCases {
        t.Run(tc.name, func(t *testing.T) {
            // Setup test case
            tc.setupMocks()

            // Stop workflow
            err := ts.engine.StopWorkflow(ts.ctx, tc.workflow.ID)

            // Validate results
            tc.validateState(t, err)

            // Verify metrics
            metrics, err := ts.engine.GetMetrics()
            require.NoError(t, err)
            require.NotNil(t, metrics)

            // Verify traces
            spans := ts.tracer.Calls
            require.NotEmpty(t, spans)
        })
    }
}

// createTestWorkflow creates a test workflow with nodes
func createTestWorkflow() (*models.Workflow, error) {
    workflow, err := models.NewWorkflow(uuid.New(), "Test Workflow", "Integration test workflow")
    if err != nil {
        return nil, err
    }

    // Add trigger node
    triggerNode, err := models.NewNode(workflow.ID, models.TriggerNode, "HTTP Trigger", map[string]interface{}{
        "trigger_type": "http",
        "method":      "POST",
        "path":        "/webhook",
    })
    if err != nil {
        return nil, err
    }
    workflow.AddNode(triggerNode)

    // Add action node
    actionNode, err := models.NewNode(workflow.ID, models.ActionNode, "Process Data", map[string]interface{}{
        "action_type": "transform",
        "config": map[string]interface{}{
            "operation": "json_parse",
        },
    })
    if err != nil {
        return nil, err
    }
    workflow.AddNode(actionNode)

    // Connect nodes
    err = actionNode.AddInputConnection(triggerNode.ID)
    if err != nil {
        return nil, err
    }

    // Set workflow status to active
    err = workflow.UpdateStatus("active")
    if err != nil {
        return nil, err
    }

    return workflow, nil
}