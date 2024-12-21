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

// WorkflowStatusMap defines valid workflow statuses
var WorkflowStatusMap = map[string]bool{
	"draft":    true,
	"active":   true,
	"paused":   true,
	"archived": true,
}

// WorkflowStatusTransitions defines valid status transitions
var WorkflowStatusTransitions = map[string][]string{
	"draft":    {"active"},
	"active":   {"paused", "archived"},
	"paused":   {"active", "archived"},
	"archived": {},
}

const (
	// MaxMetadataSize defines the maximum size of workflow metadata in bytes
	MaxMetadataSize = 1 << 20 // 1MB
)

// Common workflow errors
var (
	ErrInvalidStatus           = errors.New("invalid workflow status")
	ErrInvalidStatusTransition = errors.New("invalid workflow status transition")
	ErrNoTriggerNode          = errors.New("workflow must have at least one trigger node")
	ErrInvalidConnection      = errors.New("invalid node connection in workflow")
	ErrMetadataTooLarge      = errors.New("workflow metadata exceeds size limit")
)

// Workflow represents a complete workflow definition with thread-safe operations
type Workflow struct {
	ID            uuid.UUID              `json:"id"`
	UserID        uuid.UUID              `json:"user_id"`
	Name          string                 `json:"name"`
	Description   string                 `json:"description"`
	Status        string                 `json:"status"`
	Nodes         []*Node                `json:"nodes"`
	Metadata      map[string]interface{} `json:"metadata"`
	Version       int                    `json:"version"`
	LastExecutedAt time.Time             `json:"last_executed_at"`
	CreatedAt     time.Time             `json:"created_at"`
	UpdatedAt     time.Time             `json:"updated_at"`

	mu sync.RWMutex // Protects concurrent access to workflow data
}

// NewWorkflow creates a new Workflow instance with validation
func NewWorkflow(userID uuid.UUID, name, description string) (*Workflow, error) {
	if userID == uuid.Nil {
		return nil, errors.New("user ID is required")
	}

	if name == "" {
		return nil, errors.New("workflow name is required")
	}

	now := time.Now().UTC()
	workflow := &Workflow{
		ID:          uuid.New(),
		UserID:      userID,
		Name:        name,
		Description: description,
		Status:      "draft",
		Nodes:       make([]*Node, 0, 10), // Pre-allocate space for efficiency
		Metadata:    make(map[string]interface{}),
		Version:     1,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	return workflow, nil
}

// Validate performs comprehensive validation of the workflow
func (w *Workflow) Validate() error {
	w.mu.RLock()
	defer w.mu.RUnlock()

	// Validate status
	if !WorkflowStatusMap[w.Status] {
		return fmt.Errorf("%w: %s", ErrInvalidStatus, w.Status)
	}

	// Validate nodes
	if err := w.validateWorkflowNodes(); err != nil {
		return err
	}

	// Validate metadata size
	metadataJSON, err := json.Marshal(w.Metadata)
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}
	if len(metadataJSON) > MaxMetadataSize {
		return ErrMetadataTooLarge
	}

	return nil
}

// validateWorkflowNodes performs comprehensive node validation
func (w *Workflow) validateWorkflowNodes() error {
	if len(w.Nodes) == 0 {
		return errors.New("workflow must contain at least one node")
	}

	// Check for trigger node
	hasTrigger := false
	nodeMap := make(map[uuid.UUID]*Node)
	
	for _, node := range w.Nodes {
		if node.Type == TriggerNode {
			hasTrigger = true
		}
		nodeMap[node.ID] = node
	}

	if !hasTrigger {
		return ErrNoTriggerNode
	}

	// Validate node connections
	for _, node := range w.Nodes {
		// Validate input connections
		for _, inputID := range node.GetInputConnections() {
			if _, exists := nodeMap[inputID]; !exists {
				return fmt.Errorf("%w: invalid input connection %s", ErrInvalidConnection, inputID)
			}
		}

		// Validate output connections
		for _, outputID := range node.GetOutputConnections() {
			if _, exists := nodeMap[outputID]; !exists {
				return fmt.Errorf("%w: invalid output connection %s", ErrInvalidConnection, outputID)
			}
		}

		// Validate node configuration
		if err := node.Validate(); err != nil {
			return fmt.Errorf("node %s validation failed: %w", node.ID, err)
		}
	}

	return nil
}

// AddNode adds a new node to the workflow with validation
func (w *Workflow) AddNode(node *Node) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	if node == nil {
		return errors.New("node cannot be nil")
	}

	// Validate node before adding
	if err := node.Validate(); err != nil {
		return fmt.Errorf("node validation failed: %w", err)
	}

	w.Nodes = append(w.Nodes, node)
	w.Version++
	w.UpdatedAt = time.Now().UTC()
	return nil
}

// UpdateStatus updates the workflow status with transition validation
func (w *Workflow) UpdateStatus(newStatus string) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	if !WorkflowStatusMap[newStatus] {
		return fmt.Errorf("%w: %s", ErrInvalidStatus, newStatus)
	}

	// Validate status transition
	validTransitions, exists := WorkflowStatusTransitions[w.Status]
	if !exists {
		return fmt.Errorf("%w: current status %s", ErrInvalidStatus, w.Status)
	}

	validTransition := false
	for _, validStatus := range validTransitions {
		if validStatus == newStatus {
			validTransition = true
			break
		}
	}

	if !validTransition {
		return fmt.Errorf("%w: %s to %s", ErrInvalidStatusTransition, w.Status, newStatus)
	}

	w.Status = newStatus
	w.Version++
	w.UpdatedAt = time.Now().UTC()
	return nil
}

// UpdateMetadata updates the workflow metadata with size validation
func (w *Workflow) UpdateMetadata(metadata map[string]interface{}) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return fmt.Errorf("failed to marshal metadata: %w", err)
	}

	if len(metadataJSON) > MaxMetadataSize {
		return ErrMetadataTooLarge
	}

	w.Metadata = metadata
	w.Version++
	w.UpdatedAt = time.Now().UTC()
	return nil
}

// UpdateLastExecuted updates the last execution timestamp
func (w *Workflow) UpdateLastExecuted() {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.LastExecutedAt = time.Now().UTC()
	w.UpdatedAt = w.LastExecutedAt
}

// GetNodes returns a copy of the workflow nodes
func (w *Workflow) GetNodes() []*Node {
	w.mu.RLock()
	defer w.mu.RUnlock()

	nodes := make([]*Node, len(w.Nodes))
	copy(nodes, w.Nodes)
	return nodes
}

// GetMetadata returns a copy of the workflow metadata
func (w *Workflow) GetMetadata() map[string]interface{} {
	w.mu.RLock()
	defer w.mu.RUnlock()

	metadata := make(map[string]interface{}, len(w.Metadata))
	for k, v := range w.Metadata {
		metadata[k] = v
	}
	return metadata
}