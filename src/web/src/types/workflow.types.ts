/**
 * @fileoverview TypeScript type definitions for workflows, providing comprehensive
 * type safety for workflow-related operations in the frontend application.
 * @version 1.0.0
 */

// Internal imports
import { 
  Node, 
  NodeValidationError, 
  ValidationSeverity 
} from './node.types';

/**
 * Defines the possible states of a workflow
 */
export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'archived';

/**
 * Defines the possible states of a workflow execution
 */
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Enhanced metadata interface for workflows with version control and audit support
 */
export interface WorkflowMetadata {
  readonly tags: readonly string[];
  category: string;
  description: string;
  version: number;
  lastModifiedBy: string;
  isTemplate: boolean;
}

/**
 * Interface for workflow execution metrics
 */
export interface WorkflowMetrics {
  executionTime: number;
  nodeExecutionTimes: Record<string, number>;
  resourceUsage: {
    memory: number;
    cpu: number;
  };
  costMetrics?: {
    aiTokens: number;
    apiCalls: number;
    estimatedCost: number;
  };
}

/**
 * Interface for workflow execution errors
 */
export interface WorkflowError {
  code: string;
  message: string;
  stack?: string;
  nodeId?: string;
  context: Record<string, unknown>;
}

/**
 * Interface for node execution state tracking
 */
export interface NodeExecutionState {
  status: ExecutionStatus;
  startTime: Date;
  endTime?: Date;
  error?: WorkflowError;
  outputs: Record<string, unknown>;
  metrics: {
    duration: number;
    retries: number;
  };
}

/**
 * Enhanced interface for workflow execution state with metrics and error handling
 */
export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: ExecutionStatus;
  startTime: Date;
  endTime: Date | null;
  nodeStates: Record<string, NodeExecutionState>;
  error: WorkflowError | null;
  metrics: WorkflowMetrics;
  retryCount: number;
}

/**
 * Interface for workflow permissions
 */
export interface WorkflowPermissions {
  canView: boolean;
  canEdit: boolean;
  canExecute: boolean;
  canDelete: boolean;
  canShare: boolean;
}

/**
 * Interface for workflow scheduling
 */
export interface WorkflowSchedule {
  enabled: boolean;
  cronExpression: string;
  timezone: string;
  startDate?: Date;
  endDate?: Date;
  maxExecutions?: number;
  executionCount: number;
}

/**
 * Enhanced main interface for workflow definition with permissions and scheduling
 */
export interface Workflow {
  id: string;
  userId: string;
  name: string;
  status: WorkflowStatus;
  nodes: readonly Node[];
  metadata: WorkflowMetadata;
  version: number;
  lastExecutedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  permissions: WorkflowPermissions;
  schedule: WorkflowSchedule | null;
}

/**
 * Enhanced interface for workflow validation errors with severity and suggestions
 */
export interface WorkflowValidationError {
  field: string;
  message: string;
  code: string;
  severity: ValidationSeverity;
  nodeErrors: NodeValidationError[];
  suggestions: string[];
}

/**
 * Type guard to check if a value is a valid WorkflowStatus
 */
export function isWorkflowStatus(value: string): value is WorkflowStatus {
  return ['draft', 'active', 'paused', 'archived'].includes(value);
}

/**
 * Type guard to check if a value is a valid ExecutionStatus
 */
export function isExecutionStatus(value: string): value is ExecutionStatus {
  return ['pending', 'running', 'completed', 'failed'].includes(value);
}

/**
 * Type guard to check if an object is a valid Workflow
 */
export function isWorkflow(value: unknown): value is Workflow {
  const workflow = value as Workflow;
  return (
    typeof workflow === 'object' &&
    workflow !== null &&
    typeof workflow.id === 'string' &&
    typeof workflow.userId === 'string' &&
    typeof workflow.name === 'string' &&
    isWorkflowStatus(workflow.status) &&
    Array.isArray(workflow.nodes) &&
    typeof workflow.version === 'number' &&
    workflow.createdAt instanceof Date &&
    workflow.updatedAt instanceof Date
  );
}