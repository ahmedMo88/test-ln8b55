/**
 * @fileoverview TypeScript type definitions for workflow nodes, providing comprehensive 
 * type safety for node-related operations in the visual workflow editor.
 * @version 1.0.0
 */

// External imports
import { v4 as uuidv4 } from 'uuid'; // v9.0.0

/**
 * Defines the possible types of nodes in the workflow system
 */
export type NodeType = 'trigger' | 'action' | 'condition' | 'ai_task';

/**
 * Defines the possible execution states of a node
 */
export type NodeStatus = 'idle' | 'running' | 'completed' | 'error' | 'warning' | 'disabled';

/**
 * Defines the severity levels for validation errors
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Defines the types of connections between nodes
 */
export type ConnectionType = 'success' | 'failure' | 'default' | 'conditional';

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  maxAttempts: number;
  backoffMultiplier: number;
  initialDelay: number;
  maxDelay: number;
}

/**
 * Defines the position of a node in the canvas
 */
export interface NodePosition {
  x: number;
  y: number;
  z: number;
}

/**
 * Defines the configuration for a node
 */
export interface NodeConfig {
  service: string;
  operation: string;
  parameters: Record<string, unknown>;
  retryPolicy: RetryConfig;
  timeout: number;
}

/**
 * Defines a connection between nodes in the workflow
 */
export interface NodeConnection {
  id: string;
  sourceId: string;
  targetId: string;
  type: ConnectionType;
  metadata: Record<string, unknown>;
}

/**
 * Comprehensive interface defining a workflow node
 */
export interface Node {
  id: string;
  workflowId: string;
  type: NodeType;
  name: string;
  description: string;
  config: NodeConfig;
  position: NodePosition;
  status: NodeStatus;
  inputConnections: string[];
  outputConnections: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for node validation errors
 */
export interface NodeValidationError {
  nodeId: string;
  field: string;
  message: string;
  severity: ValidationSeverity;
  context: Record<string, unknown>;
}

/**
 * Type guard to check if a value is a valid NodeType
 */
export function isNodeType(value: string): value is NodeType {
  return ['trigger', 'action', 'condition', 'ai_task'].includes(value);
}

/**
 * Type guard to check if a value is a valid NodeStatus
 */
export function isNodeStatus(value: string): value is NodeStatus {
  return ['idle', 'running', 'completed', 'error', 'warning', 'disabled'].includes(value);
}

/**
 * Type guard to check if an object is a valid Node
 */
export function isNode(value: unknown): value is Node {
  const node = value as Node;
  return (
    typeof node === 'object' &&
    node !== null &&
    typeof node.id === 'string' &&
    typeof node.workflowId === 'string' &&
    isNodeType(node.type) &&
    typeof node.name === 'string' &&
    typeof node.description === 'string' &&
    Array.isArray(node.inputConnections) &&
    Array.isArray(node.outputConnections) &&
    node.createdAt instanceof Date &&
    node.updatedAt instanceof Date
  );
}

/**
 * Creates a new empty node with default values
 */
export function createEmptyNode(workflowId: string, type: NodeType): Node {
  return {
    id: uuidv4(),
    workflowId,
    type,
    name: '',
    description: '',
    config: {
      service: '',
      operation: '',
      parameters: {},
      retryPolicy: {
        maxAttempts: 3,
        backoffMultiplier: 1.5,
        initialDelay: 1000,
        maxDelay: 10000
      },
      timeout: 30000
    },
    position: { x: 0, y: 0, z: 0 },
    status: 'idle',
    inputConnections: [],
    outputConnections: [],
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date()
  };
}