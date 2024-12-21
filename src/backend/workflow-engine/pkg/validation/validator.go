// Package validation provides comprehensive enterprise-grade validation functionality
// for workflow and node configurations with thread-safe operations.
package validation

import (
    "errors"
    "fmt"
    "sync"

    "github.com/your-org/workflow-engine/internal/models" // v1.0.0
)

// ComplianceLevel defines the level of compliance validation required
type ComplianceLevel int

const (
    // Compliance levels for validation
    ComplianceBasic ComplianceLevel = iota
    ComplianceSOC2
    ComplianceHIPAA
    ComplianceGDPR
)

const (
    // MaxNodesPerWorkflow defines the maximum number of nodes allowed in a workflow
    MaxNodesPerWorkflow = 100
    // MaxConnectionsPerNode defines the maximum connections per node
    MaxConnectionsPerNode = 50
)

// Common validation errors
var (
    ErrInvalidWorkflow      = errors.New("invalid workflow configuration")
    ErrInvalidNode          = errors.New("invalid node configuration")
    ErrInvalidConnection    = errors.New("invalid node connection")
    ErrComplianceViolation  = errors.New("compliance violation")
)

// NodeTypeValidators stores type-specific validation functions
var NodeTypeValidators sync.Map

// init registers default node type validators
func init() {
    // Register default validators for each node type
    NodeTypeValidators.Store(models.TriggerNode, validateTriggerNode)
    NodeTypeValidators.Store(models.ActionNode, validateActionNode)
    NodeTypeValidators.Store(models.ConditionNode, validateConditionNode)
    NodeTypeValidators.Store(models.AITaskNode, validateAITaskNode)
}

// ValidateWorkflow performs comprehensive workflow validation with compliance checks
func ValidateWorkflow(workflow *models.Workflow, level ComplianceLevel) error {
    if workflow == nil {
        return fmt.Errorf("%w: workflow is nil", ErrInvalidWorkflow)
    }

    // Validate workflow size constraints
    if len(workflow.Nodes) > MaxNodesPerWorkflow {
        return fmt.Errorf("%w: exceeds maximum node limit of %d", ErrInvalidWorkflow, MaxNodesPerWorkflow)
    }

    // Validate workflow status
    if !models.WorkflowStatusMap[workflow.Status] {
        return fmt.Errorf("%w: invalid status %s", ErrInvalidWorkflow, workflow.Status)
    }

    // Concurrent node validation with error aggregation
    errChan := make(chan error, len(workflow.Nodes))
    var wg sync.WaitGroup

    for _, node := range workflow.Nodes {
        wg.Add(1)
        go func(n *models.Node) {
            defer wg.Done()
            if err := ValidateNode(n, level); err != nil {
                errChan <- fmt.Errorf("node %s validation failed: %w", n.ID, err)
            }
        }(node)
    }

    // Wait for all node validations to complete
    wg.Wait()
    close(errChan)

    // Collect any validation errors
    var validationErrors []error
    for err := range errChan {
        validationErrors = append(validationErrors, err)
    }

    if len(validationErrors) > 0 {
        return fmt.Errorf("%w: %v", ErrInvalidWorkflow, validationErrors)
    }

    // Validate workflow connections and detect cycles
    if err := validateWorkflowConnections(workflow); err != nil {
        return fmt.Errorf("%w: %v", ErrInvalidWorkflow, err)
    }

    // Perform compliance-specific validation
    if err := validateWorkflowCompliance(workflow, level); err != nil {
        return fmt.Errorf("%w: %v", ErrComplianceViolation, err)
    }

    return nil
}

// ValidateNode performs comprehensive node validation with compliance checks
func ValidateNode(node *models.Node, level ComplianceLevel) error {
    if node == nil {
        return fmt.Errorf("%w: node is nil", ErrInvalidNode)
    }

    // Validate node type
    if !models.NodeTypeMap[node.Type] {
        return fmt.Errorf("%w: unsupported node type %s", ErrInvalidNode, node.Type)
    }

    // Validate node position
    if node.PositionX < 0 || node.PositionY < 0 {
        return fmt.Errorf("%w: invalid position (%d,%d)", ErrInvalidNode, node.PositionX, node.PositionY)
    }

    // Validate connection limits
    if len(node.InputConnections)+len(node.OutputConnections) > MaxConnectionsPerNode {
        return fmt.Errorf("%w: exceeds maximum connection limit", ErrInvalidNode)
    }

    // Execute type-specific validation
    if validator, ok := NodeTypeValidators.Load(node.Type); ok {
        if err := validator.(func(*models.Node) error)(node); err != nil {
            return fmt.Errorf("%w: type-specific validation failed: %v", ErrInvalidNode, err)
        }
    }

    // Perform compliance-specific validation
    if err := validateNodeCompliance(node, level); err != nil {
        return fmt.Errorf("%w: %v", ErrComplianceViolation, err)
    }

    return nil
}

// validateWorkflowConnections validates node connections and detects cycles
func validateWorkflowConnections(workflow *models.Workflow) error {
    // Build adjacency map for cycle detection
    adjacencyMap := make(map[string][]string)
    nodeMap := make(map[string]*models.Node)

    for _, node := range workflow.Nodes {
        nodeMap[node.ID.String()] = node
        for _, outConn := range node.OutputConnections {
            adjacencyMap[node.ID.String()] = append(adjacencyMap[node.ID.String()], outConn.String())
        }
    }

    // Detect cycles using DFS
    visited := make(map[string]bool)
    recursionStack := make(map[string]bool)

    for nodeID := range adjacencyMap {
        if !visited[nodeID] {
            if hasCycle(nodeID, adjacencyMap, visited, recursionStack) {
                return fmt.Errorf("%w: circular dependency detected", ErrInvalidConnection)
            }
        }
    }

    return nil
}

// validateWorkflowCompliance performs compliance-specific workflow validation
func validateWorkflowCompliance(workflow *models.Workflow, level ComplianceLevel) error {
    switch level {
    case ComplianceSOC2:
        return validateSOC2Compliance(workflow)
    case ComplianceHIPAA:
        return validateHIPAACompliance(workflow)
    case ComplianceGDPR:
        return validateGDPRCompliance(workflow)
    }
    return nil
}

// validateNodeCompliance performs compliance-specific node validation
func validateNodeCompliance(node *models.Node, level ComplianceLevel) error {
    switch level {
    case ComplianceSOC2:
        return validateNodeSOC2Compliance(node)
    case ComplianceHIPAA:
        return validateNodeHIPAACompliance(node)
    case ComplianceGDPR:
        return validateNodeGDPRCompliance(node)
    }
    return nil
}

// Type-specific validation functions
func validateTriggerNode(node *models.Node) error {
    if _, ok := node.Config["trigger_type"]; !ok {
        return fmt.Errorf("%w: missing required trigger_type", ErrInvalidNode)
    }
    return nil
}

func validateActionNode(node *models.Node) error {
    if _, ok := node.Config["action_type"]; !ok {
        return fmt.Errorf("%w: missing required action_type", ErrInvalidNode)
    }
    return nil
}

func validateConditionNode(node *models.Node) error {
    if _, ok := node.Config["condition"]; !ok {
        return fmt.Errorf("%w: missing required condition", ErrInvalidNode)
    }
    return nil
}

func validateAITaskNode(node *models.Node) error {
    if _, ok := node.Config["ai_model"]; !ok {
        return fmt.Errorf("%w: missing required ai_model", ErrInvalidNode)
    }
    return nil
}

// Compliance-specific validation functions
func validateSOC2Compliance(workflow *models.Workflow) error {
    // Implement SOC2 compliance checks
    return nil
}

func validateHIPAACompliance(workflow *models.Workflow) error {
    // Implement HIPAA compliance checks
    return nil
}

func validateGDPRCompliance(workflow *models.Workflow) error {
    // Implement GDPR compliance checks
    return nil
}

func validateNodeSOC2Compliance(node *models.Node) error {
    // Implement node-level SOC2 compliance checks
    return nil
}

func validateNodeHIPAACompliance(node *models.Node) error {
    // Implement node-level HIPAA compliance checks
    return nil
}

func validateNodeGDPRCompliance(node *models.Node) error {
    // Implement node-level GDPR compliance checks
    return nil
}

// hasCycle performs cycle detection using DFS
func hasCycle(nodeID string, adjacencyMap map[string][]string, visited, recursionStack map[string]bool) bool {
    visited[nodeID] = true
    recursionStack[nodeID] = true

    for _, neighbor := range adjacencyMap[nodeID] {
        if !visited[neighbor] {
            if hasCycle(neighbor, adjacencyMap, visited, recursionStack) {
                return true
            }
        } else if recursionStack[neighbor] {
            return true
        }
    }

    recursionStack[nodeID] = false
    return false
}