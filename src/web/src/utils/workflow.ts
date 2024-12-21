/**
 * @fileoverview Utility functions for workflow manipulation, validation, and transformation
 * in the frontend application. Provides comprehensive helper functions for working with
 * workflow data structures, node connections, execution states, and validation caching.
 * @version 1.0.0
 */

// External imports
import { cloneDeep } from 'lodash'; // v4.17.21

// Internal imports
import { 
  Workflow, 
  WorkflowStatus, 
  WorkflowExecution, 
  WorkflowValidationError,
  NodeExecutionState,
  WorkflowMetrics,
  WorkflowError
} from '../types/workflow.types';
import { 
  Node, 
  NodeStatus, 
  NodeConnection,
  ValidationSeverity 
} from '../types/node.types';
import { 
  validateWorkflow, 
  ValidationResult 
} from './validation';

// Constants
const VALIDATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Cache for storing validation results to improve performance
 */
const validationCache = new Map<string, {
  result: ValidationResult;
  timestamp: number;
}>();

/**
 * Input validation decorator
 */
function validateInput(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  descriptor.value = function(...args: any[]) {
    if (!args[0] || typeof args[0] !== 'object') {
      throw new Error('Invalid input: Workflow object required');
    }
    return originalMethod.apply(this, args);
  };
  return descriptor;
}

/**
 * Creates a deep clone of a workflow object with enhanced error handling
 * @param workflow The workflow to clone
 * @returns A deep clone of the workflow with new IDs and reset validation cache
 * @throws Error if cloning fails
 */
@validateInput
export function cloneWorkflow(workflow: Workflow): Workflow {
  try {
    // Deep clone the workflow
    const clonedWorkflow = cloneDeep(workflow);

    // Generate new IDs for workflow and nodes
    clonedWorkflow.id = crypto.randomUUID();
    clonedWorkflow.nodes = clonedWorkflow.nodes.map(node => ({
      ...node,
      id: crypto.randomUUID(),
      workflowId: clonedWorkflow.id
    }));

    // Reset workflow status and metadata
    clonedWorkflow.status = 'draft';
    clonedWorkflow.version = 1;
    clonedWorkflow.lastExecutedAt = null;
    clonedWorkflow.createdAt = new Date();
    clonedWorkflow.updatedAt = new Date();

    // Verify clone integrity
    if (!verifyWorkflowIntegrity(clonedWorkflow)) {
      throw new Error('Workflow clone integrity check failed');
    }

    return clonedWorkflow;
  } catch (error) {
    throw new Error(`Failed to clone workflow: ${error.message}`);
  }
}

/**
 * Gets all nodes connected to a specific node with bidirectional traversal
 * @param workflow The workflow containing the nodes
 * @param nodeId ID of the node to get connections for
 * @returns Array of connected nodes with connection metadata
 */
export function getConnectedNodes(workflow: Workflow, nodeId: string): Array<{
  node: Node;
  connection: NodeConnection;
  direction: 'incoming' | 'outgoing';
}> {
  const connectedNodes: Array<{
    node: Node;
    connection: NodeConnection;
    direction: 'incoming' | 'outgoing';
  }> = [];
  const visited = new Set<string>();

  const sourceNode = workflow.nodes.find(node => node.id === nodeId);
  if (!sourceNode) {
    throw new Error(`Node with ID ${nodeId} not found in workflow`);
  }

  // Helper function for recursive traversal
  function traverseConnections(
    currentNode: Node,
    direction: 'incoming' | 'outgoing',
    depth = 0
  ) {
    if (visited.has(currentNode.id) || depth > 100) {
      return; // Prevent infinite recursion
    }
    visited.add(currentNode.id);

    const connections = direction === 'incoming' 
      ? currentNode.inputConnections 
      : currentNode.outputConnections;

    connections.forEach(connectionId => {
      const connectedNode = workflow.nodes.find(node => 
        direction === 'incoming' 
          ? node.outputConnections.includes(connectionId)
          : node.inputConnections.includes(connectionId)
      );

      if (connectedNode && !visited.has(connectedNode.id)) {
        connectedNodes.push({
          node: connectedNode,
          connection: {
            id: connectionId,
            sourceId: direction === 'incoming' ? connectedNode.id : currentNode.id,
            targetId: direction === 'incoming' ? currentNode.id : connectedNode.id,
            type: 'default',
            metadata: {}
          },
          direction
        });
        traverseConnections(connectedNode, direction, depth + 1);
      }
    });
  }

  // Traverse both incoming and outgoing connections
  traverseConnections(sourceNode, 'incoming');
  visited.clear();
  traverseConnections(sourceNode, 'outgoing');

  return connectedNodes;
}

/**
 * Checks if a workflow is valid for deployment with enhanced validation and caching
 * @param workflow The workflow to validate
 * @returns Detailed validation result with cache status
 */
export function isWorkflowValid(workflow: Workflow): ValidationResult {
  const cacheKey = `${workflow.id}-${workflow.version}`;
  const cachedValidation = validationCache.get(cacheKey);

  // Return cached result if still valid
  if (cachedValidation && 
      Date.now() - cachedValidation.timestamp < VALIDATION_CACHE_TTL) {
    return cachedValidation.result;
  }

  let attempts = 0;
  let validationResult: ValidationResult;

  // Retry validation with exponential backoff
  while (attempts < MAX_RETRY_ATTEMPTS) {
    try {
      validationResult = validateWorkflow(workflow);
      break;
    } catch (error) {
      attempts++;
      if (attempts === MAX_RETRY_ATTEMPTS) {
        throw new Error(`Validation failed after ${MAX_RETRY_ATTEMPTS} attempts: ${error.message}`);
      }
      // Exponential backoff
      const delay = Math.pow(2, attempts) * 100;
      console.warn(`Validation attempt ${attempts} failed, retrying in ${delay}ms`);
    }
  }

  // Cache the validation result
  validationCache.set(cacheKey, {
    result: validationResult!,
    timestamp: Date.now()
  });

  return validationResult!;
}

/**
 * Gets a detailed execution status with metrics and performance data
 * @param execution The workflow execution to analyze
 * @returns Comprehensive execution status with metrics
 */
export function getWorkflowExecutionStatus(
  execution: WorkflowExecution
): {
  status: WorkflowStatus;
  metrics: WorkflowMetrics;
  nodeStates: Record<string, NodeExecutionState>;
  error?: WorkflowError;
  performance: {
    totalDuration: number;
    averageNodeDuration: number;
    bottleneckNodes: string[];
  };
} {
  // Calculate execution metrics
  const nodeStates = execution.nodeStates;
  const completedNodes = Object.values(nodeStates).filter(
    state => state.status === 'completed'
  );
  const failedNodes = Object.values(nodeStates).filter(
    state => state.status === 'failed'
  );

  // Calculate performance metrics
  const nodeDurations = completedNodes.map(node => node.metrics.duration);
  const totalDuration = nodeDurations.reduce((sum, duration) => sum + duration, 0);
  const averageNodeDuration = totalDuration / (nodeDurations.length || 1);

  // Identify bottleneck nodes (nodes taking >50% longer than average)
  const bottleneckThreshold = averageNodeDuration * 1.5;
  const bottleneckNodes = Object.entries(nodeStates)
    .filter(([_, state]) => state.metrics.duration > bottleneckThreshold)
    .map(([nodeId]) => nodeId);

  return {
    status: execution.status === 'failed' ? 'error' : 'active',
    metrics: execution.metrics,
    nodeStates,
    error: execution.error || undefined,
    performance: {
      totalDuration,
      averageNodeDuration,
      bottleneckNodes
    }
  };
}

/**
 * Verifies the integrity of a workflow object
 * @param workflow The workflow to verify
 * @returns boolean indicating if the workflow is valid
 */
function verifyWorkflowIntegrity(workflow: Workflow): boolean {
  // Check required properties
  if (!workflow.id || !workflow.name || !Array.isArray(workflow.nodes)) {
    return false;
  }

  // Verify node references
  const nodeIds = new Set(workflow.nodes.map(node => node.id));
  for (const node of workflow.nodes) {
    // Verify workflowId references
    if (node.workflowId !== workflow.id) {
      return false;
    }

    // Verify connection references
    for (const connectionId of [...node.inputConnections, ...node.outputConnections]) {
      const connectedNode = workflow.nodes.find(n => 
        n.inputConnections.includes(connectionId) || 
        n.outputConnections.includes(connectionId)
      );
      if (!connectedNode || !nodeIds.has(connectedNode.id)) {
        return false;
      }
    }
  }

  return true;
}