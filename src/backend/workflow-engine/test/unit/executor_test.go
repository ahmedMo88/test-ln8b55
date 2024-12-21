package unit

import (
    "context"
    "errors"
    "testing"
    "time"

    "github.com/golang/mock/gomock"
    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "go.opentelemetry.io/otel/trace"

    "internal/core"
    "internal/models"
)

// Mock implementations
type mockNodeExecutor struct {
    mock.Mock
}

// Test constants
const (
    testTimeout = 5 * time.Second
    defaultNodeCount = 5
)

// Performance thresholds
var metricThresholds = map[string]float64{
    "workflow_execution": 5.0,  // seconds
    "node_execution":     1.0,  // seconds
    "error_rate":        0.01,  // 1% error rate
}

// TestExecuteWorkflow tests successful workflow execution with multiple nodes
func TestExecuteWorkflow(t *testing.T) {
    // Initialize controller and mocks
    ctrl := gomock.NewController(t)
    defer ctrl.Finish()

    // Create test context with timeout
    ctx, cancel := context.WithTimeout(context.Background(), testTimeout)
    defer cancel()

    // Create test workflow
    workflowID := uuid.New()
    workflow := createTestWorkflow(workflowID, defaultNodeCount)

    // Initialize executor with mocks
    executor := core.NewExecutor(nil, nil) // Using nil connections for unit test

    // Test execution
    t.Run("Successful Execution", func(t *testing.T) {
        err := executor.ExecuteWorkflow(ctx, workflow)
        assert.NoError(t, err)
        assert.Equal(t, "completed", workflow.Status)
        
        // Verify metrics
        metrics := executor.GetMetrics()
        assert.Less(t, metrics.ExecutionDuration.Seconds(), metricThresholds["workflow_execution"])
        assert.Equal(t, defaultNodeCount, metrics.NodesExecuted)
        assert.Equal(t, 0, metrics.ErrorCount)
    })

    t.Run("Execution With Tracing", func(t *testing.T) {
        spanCtx, span := trace.NewTracer("test").Start(ctx, "TestExecuteWorkflow")
        defer span.End()

        err := executor.ExecuteWorkflow(spanCtx, workflow)
        assert.NoError(t, err)

        // Verify trace propagation
        assert.NotNil(t, span.SpanContext().TraceID())
        assert.True(t, span.IsRecording())
    })
}

// TestExecuteNode tests individual node execution
func TestExecuteNode(t *testing.T) {
    ctrl := gomock.NewController(t)
    defer ctrl.Finish()

    ctx, cancel := context.WithTimeout(context.Background(), testTimeout)
    defer cancel()

    executor := core.NewExecutor(nil, nil)

    tests := []struct {
        name     string
        nodeType models.NodeType
        config   map[string]interface{}
        wantErr  bool
    }{
        {
            name:     "Trigger Node",
            nodeType: models.TriggerNode,
            config: map[string]interface{}{
                "trigger_type": "schedule",
                "cron": "*/5 * * * *",
            },
            wantErr: false,
        },
        {
            name:     "Action Node",
            nodeType: models.ActionNode,
            config: map[string]interface{}{
                "action_type": "http",
                "method": "POST",
                "url": "https://api.example.com",
            },
            wantErr: false,
        },
        {
            name:     "AI Task Node",
            nodeType: models.AITaskNode,
            config: map[string]interface{}{
                "ai_model": "gpt-4",
                "prompt": "Analyze data",
            },
            wantErr: false,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            node := createTestNode(uuid.New(), tt.nodeType, tt.config)
            
            result, err := executor.ExecuteNode(ctx, node, nil)
            if tt.wantErr {
                assert.Error(t, err)
                return
            }
            
            assert.NoError(t, err)
            assert.NotNil(t, result)
            
            // Verify node execution metrics
            metrics := executor.GetMetrics()
            assert.Less(t, metrics.LastNodeDuration.Seconds(), metricThresholds["node_execution"])
        })
    }
}

// TestExecutionErrors tests error handling scenarios
func TestExecutionErrors(t *testing.T) {
    ctrl := gomock.NewController(t)
    defer ctrl.Finish()

    ctx, cancel := context.WithTimeout(context.Background(), testTimeout)
    defer cancel()

    executor := core.NewExecutor(nil, nil)

    tests := []struct {
        name        string
        setup      func() (*models.Workflow, error)
        wantErr    error
    }{
        {
            name: "Timeout Error",
            setup: func() (*models.Workflow, error) {
                workflow := createTestWorkflow(uuid.New(), 1)
                // Set unrealistic timeout
                timeoutCtx, _ := context.WithTimeout(ctx, 1*time.Nanosecond)
                return workflow, executor.ExecuteWorkflow(timeoutCtx, workflow)
            },
            wantErr: context.DeadlineExceeded,
        },
        {
            name: "Validation Error",
            setup: func() (*models.Workflow, error) {
                workflow := createTestWorkflow(uuid.New(), 0) // Invalid: no nodes
                return workflow, executor.ExecuteWorkflow(ctx, workflow)
            },
            wantErr: models.ErrNoTriggerNode,
        },
        {
            name: "Execution Error",
            setup: func() (*models.Workflow, error) {
                workflow := createTestWorkflow(uuid.New(), 1)
                // Inject failing node
                workflow.Nodes[0].Config = map[string]interface{}{
                    "error": "forced failure",
                }
                return workflow, executor.ExecuteWorkflow(ctx, workflow)
            },
            wantErr: errors.New("execution failed"),
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            workflow, err := tt.setup()
            assert.Error(t, err)
            assert.True(t, errors.Is(err, tt.wantErr) || err.Error() == tt.wantErr.Error())
            
            // Verify error metrics
            metrics := executor.GetMetrics()
            assert.Greater(t, metrics.ErrorCount, 0)
            assert.Equal(t, "failed", workflow.Status)
        })
    }
}

// Helper functions

func createTestWorkflow(id uuid.UUID, nodeCount int) *models.Workflow {
    workflow, _ := models.NewWorkflow(uuid.New(), "Test Workflow", "Test Description")
    workflow.ID = id

    // Add nodes
    for i := 0; i < nodeCount; i++ {
        var nodeType models.NodeType
        switch i {
        case 0:
            nodeType = models.TriggerNode
        case nodeCount - 1:
            nodeType = models.ActionNode
        default:
            nodeType = models.ConditionNode
        }

        node := createTestNode(workflow.ID, nodeType, nil)
        workflow.AddNode(node)
    }

    return workflow
}

func createTestNode(workflowID uuid.UUID, nodeType models.NodeType, config map[string]interface{}) *models.Node {
    if config == nil {
        config = getDefaultConfig(nodeType)
    }

    node, _ := models.NewNode(workflowID, nodeType, "Test Node", config)
    return node
}

func getDefaultConfig(nodeType models.NodeType) map[string]interface{} {
    switch nodeType {
    case models.TriggerNode:
        return map[string]interface{}{
            "trigger_type": "manual",
        }
    case models.ActionNode:
        return map[string]interface{}{
            "action_type": "log",
            "message": "test action",
        }
    case models.ConditionNode:
        return map[string]interface{}{
            "condition": "true",
        }
    case models.AITaskNode:
        return map[string]interface{}{
            "ai_model": "gpt-4",
            "task": "analyze",
        }
    default:
        return map[string]interface{}{}
    }
}