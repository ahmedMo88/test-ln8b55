// Package models provides the core data models for the workflow engine
package models

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/google/uuid" // v1.3.0
	"sync"
	"time"
)

// NodeType represents the supported types of nodes in a workflow
type NodeType string

const (
	// Node type constants
	TriggerNode   NodeType = "trigger"
	ActionNode    NodeType = "action"
	ConditionNode NodeType = "condition"
	AITaskNode    NodeType = "ai_task"

	// MaxConnections defines the maximum number of connections per node
	MaxConnections = 100

	// MaxConfigSize defines the maximum size of node configuration in bytes
	MaxConfigSize = 1024 * 1024 // 1MB
)

// NodeTypeMap defines valid node types for validation
var NodeTypeMap = map[NodeType]bool{
	TriggerNode:   true,
	ActionNode:    true,
	ConditionNode: true,
	AITaskNode:    true,
}

// Common errors
var (
	ErrInvalidNodeType     = errors.New("invalid node type")
	ErrInvalidConfig       = errors.New("invalid node configuration")
	ErrInvalidConnection   = errors.New("invalid node connection")
	ErrConnectionLimit     = errors.New("maximum connection limit reached")
	ErrDuplicateConnection = errors.New("duplicate connection")
	ErrInvalidPosition     = errors.New("invalid node position")
)

// Node represents a component in a workflow with thread-safe operations
type Node struct {
	ID               uuid.UUID              `json:"id"`
	WorkflowID       uuid.UUID              `json:"workflow_id"`
	Type             NodeType               `json:"type"`
	Name             string                 `json:"name"`
	Config           map[string]interface{} `json:"config"`
	InputConnections []uuid.UUID           `json:"input_connections"`
	OutputConnections []uuid.UUID          `json:"output_connections"`
	PositionX        int                   `json:"position_x"`
	PositionY        int                   `json:"position_y"`
	CreatedAt        time.Time             `json:"created_at"`
	UpdatedAt        time.Time             `json:"updated_at"`

	mu sync.RWMutex // Protects concurrent access to node data
}

// NewNode creates a new Node instance with validation
func NewNode(workflowID uuid.UUID, nodeType NodeType, name string, config map[string]interface{}) (*Node, error) {
	if workflowID == uuid.Nil {
		return nil, errors.New("workflow ID is required")
	}

	if err := validateNodeType(nodeType); err != nil {
		return nil, err
	}

	if name == "" {
		return nil, errors.New("node name is required")
	}

	if err := validateNodeConfig(nodeType, config); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	node := &Node{
		ID:                uuid.New(),
		WorkflowID:        workflowID,
		Type:              nodeType,
		Name:              name,
		Config:            config,
		InputConnections:  make([]uuid.UUID, 0),
		OutputConnections: make([]uuid.UUID, 0),
		CreatedAt:         now,
		UpdatedAt:         now,
	}

	return node, nil
}

// Validate performs comprehensive validation of the node
func (n *Node) Validate() error {
	n.mu.RLock()
	defer n.mu.RUnlock()

	if err := validateNodeType(n.Type); err != nil {
		return fmt.Errorf("node type validation failed: %w", err)
	}

	if err := validateNodeConfig(n.Type, n.Config); err != nil {
		return fmt.Errorf("configuration validation failed: %w", err)
	}

	if len(n.InputConnections)+len(n.OutputConnections) > MaxConnections {
		return ErrConnectionLimit
	}

	if n.PositionX < 0 || n.PositionY < 0 {
		return ErrInvalidPosition
	}

	return nil
}

// AddInputConnection adds an input connection with validation
func (n *Node) AddInputConnection(sourceNodeID uuid.UUID) error {
	n.mu.Lock()
	defer n.mu.Unlock()

	if sourceNodeID == uuid.Nil {
		return errors.New("invalid source node ID")
	}

	if len(n.InputConnections) >= MaxConnections {
		return ErrConnectionLimit
	}

	// Check for duplicate connections
	for _, conn := range n.InputConnections {
		if conn == sourceNodeID {
			return ErrDuplicateConnection
		}
	}

	n.InputConnections = append(n.InputConnections, sourceNodeID)
	n.UpdatedAt = time.Now().UTC()
	return nil
}

// AddOutputConnection adds an output connection with validation
func (n *Node) AddOutputConnection(targetNodeID uuid.UUID) error {
	n.mu.Lock()
	defer n.mu.Unlock()

	if targetNodeID == uuid.Nil {
		return errors.New("invalid target node ID")
	}

	if len(n.OutputConnections) >= MaxConnections {
		return ErrConnectionLimit
	}

	// Check for duplicate connections
	for _, conn := range n.OutputConnections {
		if conn == targetNodeID {
			return ErrDuplicateConnection
		}
	}

	n.OutputConnections = append(n.OutputConnections, targetNodeID)
	n.UpdatedAt = time.Now().UTC()
	return nil
}

// validateNodeType checks if the given node type is supported
func validateNodeType(nodeType NodeType) error {
	if !NodeTypeMap[nodeType] {
		return fmt.Errorf("%w: %s", ErrInvalidNodeType, nodeType)
	}
	return nil
}

// validateNodeConfig validates node configuration based on type
func validateNodeConfig(nodeType NodeType, config map[string]interface{}) error {
	if config == nil {
		return fmt.Errorf("%w: configuration is required", ErrInvalidConfig)
	}

	// Check config size
	configJSON, err := json.Marshal(config)
	if err != nil {
		return fmt.Errorf("%w: invalid JSON", ErrInvalidConfig)
	}

	if len(configJSON) > MaxConfigSize {
		return fmt.Errorf("%w: configuration exceeds size limit", ErrInvalidConfig)
	}

	// Type-specific validation
	switch nodeType {
	case TriggerNode:
		if _, ok := config["trigger_type"]; !ok {
			return fmt.Errorf("%w: trigger_type is required", ErrInvalidConfig)
		}
	case ActionNode:
		if _, ok := config["action_type"]; !ok {
			return fmt.Errorf("%w: action_type is required", ErrInvalidConfig)
		}
	case ConditionNode:
		if _, ok := config["condition"]; !ok {
			return fmt.Errorf("%w: condition is required", ErrInvalidConfig)
		}
	case AITaskNode:
		if _, ok := config["ai_model"]; !ok {
			return fmt.Errorf("%w: ai_model is required", ErrInvalidConfig)
		}
	}

	return nil
}

// GetInputConnections returns a copy of input connections
func (n *Node) GetInputConnections() []uuid.UUID {
	n.mu.RLock()
	defer n.mu.RUnlock()
	
	connections := make([]uuid.UUID, len(n.InputConnections))
	copy(connections, n.InputConnections)
	return connections
}

// GetOutputConnections returns a copy of output connections
func (n *Node) GetOutputConnections() []uuid.UUID {
	n.mu.RLock()
	defer n.mu.RUnlock()
	
	connections := make([]uuid.UUID, len(n.OutputConnections))
	copy(connections, n.OutputConnections)
	return connections
}

// UpdateConfig updates the node configuration with validation
func (n *Node) UpdateConfig(config map[string]interface{}) error {
	n.mu.Lock()
	defer n.mu.Unlock()

	if err := validateNodeConfig(n.Type, config); err != nil {
		return err
	}

	n.Config = config
	n.UpdatedAt = time.Now().UTC()
	return nil
}

// UpdatePosition updates the node position with validation
func (n *Node) UpdatePosition(x, y int) error {
	n.mu.Lock()
	defer n.mu.Unlock()

	if x < 0 || y < 0 {
		return ErrInvalidPosition
	}

	n.PositionX = x
	n.PositionY = y
	n.UpdatedAt = time.Now().UTC()
	return nil
}