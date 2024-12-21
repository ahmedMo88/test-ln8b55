/**
 * @fileoverview Utility functions for validating workflows, nodes, and integration configurations
 * in the frontend application. Provides comprehensive validation logic for ensuring data integrity
 * and correctness before saving or executing workflows.
 * @version 1.0.0
 */

import { z } from 'zod'; // v3.22.2
import { 
  Workflow, 
  WorkflowValidationError,
  WorkflowMetadata 
} from '../types/workflow.types';
import { 
  IntegrationConfig, 
  ServiceType, 
  AuthType,
  integrationConfigSchema 
} from '../types/integration.types';

// Validation cache to improve performance for repeated validations
const validationCache = new Map<string, ValidationResult>();
const VALIDATION_TIMEOUT_MS = 5000;

/**
 * Interface for validation result with enhanced error reporting
 */
interface ValidationResult {
  isValid: boolean;
  errors: WorkflowValidationError[];
  warnings: WorkflowValidationError[];
  suggestions: string[];
  context: Record<string, unknown>;
}

/**
 * Validates a workflow's structure and configuration
 * @param workflow The workflow to validate
 * @returns ValidationResult containing any errors, warnings and suggestions
 */
export function validateWorkflow(workflow: Workflow): ValidationResult {
  const cacheKey = `workflow-${workflow.id}-${workflow.version}`;
  const cachedResult = validationCache.get(cacheKey);
  
  if (cachedResult) {
    return cachedResult;
  }

  const errors: WorkflowValidationError[] = [];
  const warnings: WorkflowValidationError[] = [];
  const suggestions: string[] = [];

  // Validate basic workflow structure
  if (!workflow.nodes.length) {
    errors.push({
      field: 'nodes',
      message: 'Workflow must contain at least one node',
      code: 'WORKFLOW_EMPTY',
      severity: 'error',
      suggestion: 'Add a trigger node to start your workflow'
    });
  }

  // Validate workflow metadata
  validateWorkflowMetadata(workflow.metadata, errors, warnings);

  // Validate node connections
  validateNodeConnections(workflow.nodes, errors, warnings);

  const result: ValidationResult = {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions,
    context: {
      workflowId: workflow.id,
      nodeCount: workflow.nodes.length,
      validatedAt: new Date()
    }
  };

  // Cache the validation result
  validationCache.set(cacheKey, result);
  setTimeout(() => validationCache.delete(cacheKey), VALIDATION_TIMEOUT_MS);

  return result;
}

/**
 * Validates integration configuration settings
 * @param config The integration configuration to validate
 * @returns ValidationResult containing validation status and details
 */
export function validateIntegrationConfig(config: IntegrationConfig): ValidationResult {
  const errors: WorkflowValidationError[] = [];
  const warnings: WorkflowValidationError[] = [];
  const suggestions: string[] = [];

  try {
    // Validate against Zod schema
    integrationConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      error.errors.forEach(err => {
        errors.push({
          field: err.path.join('.'),
          message: err.message,
          code: 'INTEGRATION_CONFIG_INVALID',
          severity: 'error',
          suggestion: 'Check the configuration requirements for this service type'
        });
      });
    }
  }

  // Validate rate limits based on service type
  validateRateLimits(config, errors, warnings);

  // Validate authentication configuration
  validateAuthConfig(config, errors, warnings);

  // Add service-specific validation
  validateServiceSpecificConfig(config, errors, warnings, suggestions);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions,
    context: {
      serviceType: config.serviceType,
      authType: config.authType,
      validatedAt: new Date()
    }
  };
}

/**
 * Validates rate limit configuration for a service
 */
function validateRateLimits(
  config: IntegrationConfig, 
  errors: WorkflowValidationError[], 
  warnings: WorkflowValidationError[]
): void {
  const { rateLimits, serviceType } = config;

  // Service-specific rate limit validation
  const rateLimitThresholds: Record<ServiceType, number> = {
    [ServiceType.EMAIL]: 100,
    [ServiceType.CLOUD_STORAGE]: 1000,
    [ServiceType.PROJECT_MANAGEMENT]: 500,
    [ServiceType.COMMUNICATION]: 200,
    [ServiceType.AI_SERVICE]: 60
  };

  if (rateLimits.requestsPerMinute > rateLimitThresholds[serviceType]) {
    warnings.push({
      field: 'rateLimits.requestsPerMinute',
      message: `Rate limit exceeds recommended threshold for ${serviceType}`,
      code: 'RATE_LIMIT_HIGH',
      severity: 'warning',
      suggestion: `Consider reducing to ${rateLimitThresholds[serviceType]} requests per minute`
    });
  }

  if (!rateLimits.burstLimit) {
    warnings.push({
      field: 'rateLimits.burstLimit',
      message: 'Burst limit not configured',
      code: 'BURST_LIMIT_MISSING',
      severity: 'warning',
      suggestion: 'Configure burst limit for better rate control'
    });
  }
}

/**
 * Validates authentication configuration
 */
function validateAuthConfig(
  config: IntegrationConfig, 
  errors: WorkflowValidationError[], 
  warnings: WorkflowValidationError[]
): void {
  const { authType, serviceType } = config;

  // Service-specific auth validation
  const requiredAuthTypes: Record<ServiceType, AuthType[]> = {
    [ServiceType.EMAIL]: [AuthType.OAUTH2],
    [ServiceType.CLOUD_STORAGE]: [AuthType.OAUTH2, AuthType.API_KEY],
    [ServiceType.PROJECT_MANAGEMENT]: [AuthType.OAUTH2, AuthType.API_KEY],
    [ServiceType.COMMUNICATION]: [AuthType.OAUTH2],
    [ServiceType.AI_SERVICE]: [AuthType.API_KEY]
  };

  if (!requiredAuthTypes[serviceType].includes(authType)) {
    errors.push({
      field: 'authType',
      message: `Invalid authentication type for ${serviceType}`,
      code: 'AUTH_TYPE_INVALID',
      severity: 'error',
      suggestion: `Use one of: ${requiredAuthTypes[serviceType].join(', ')}`
    });
  }
}

/**
 * Validates service-specific configuration requirements
 */
function validateServiceSpecificConfig(
  config: IntegrationConfig,
  errors: WorkflowValidationError[],
  warnings: WorkflowValidationError[],
  suggestions: string[]
): void {
  const { serviceType, settings } = config;

  switch (serviceType) {
    case ServiceType.EMAIL:
      validateEmailConfig(settings, errors, warnings);
      break;
    case ServiceType.AI_SERVICE:
      validateAIServiceConfig(settings, errors, warnings);
      break;
    case ServiceType.CLOUD_STORAGE:
      validateCloudStorageConfig(settings, errors, warnings);
      break;
    // Add other service-specific validations
  }
}

/**
 * Validates workflow metadata
 */
function validateWorkflowMetadata(
  metadata: WorkflowMetadata,
  errors: WorkflowValidationError[],
  warnings: WorkflowValidationError[]
): void {
  if (!metadata.description) {
    warnings.push({
      field: 'metadata.description',
      message: 'Workflow description is empty',
      code: 'DESCRIPTION_MISSING',
      severity: 'warning',
      suggestion: 'Add a description to improve workflow documentation'
    });
  }

  if (metadata.tags.length === 0) {
    warnings.push({
      field: 'metadata.tags',
      message: 'No tags specified for workflow',
      code: 'TAGS_MISSING',
      severity: 'warning',
      suggestion: 'Add tags to improve workflow organization and searchability'
    });
  }
}

/**
 * Validates node connections in a workflow
 */
function validateNodeConnections(
  nodes: readonly Node[],
  errors: WorkflowValidationError[],
  warnings: WorkflowValidationError[]
): void {
  // Check for orphaned nodes
  nodes.forEach(node => {
    if (node.inputConnections.length === 0 && node.type !== 'trigger') {
      errors.push({
        field: `nodes.${node.id}`,
        message: 'Node has no input connections',
        code: 'NODE_ORPHANED',
        severity: 'error',
        suggestion: 'Connect the node to a trigger or previous action'
      });
    }
  });

  // Check for circular dependencies
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  nodes.forEach(node => {
    if (!visited.has(node.id)) {
      checkCircularDependencies(node, nodes, visited, recursionStack, errors);
    }
  });
}

/**
 * Checks for circular dependencies in node connections
 */
function checkCircularDependencies(
  node: Node,
  nodes: readonly Node[],
  visited: Set<string>,
  recursionStack: Set<string>,
  errors: WorkflowValidationError[]
): void {
  visited.add(node.id);
  recursionStack.add(node.id);

  node.outputConnections.forEach(connectionId => {
    const targetNode = nodes.find(n => 
      n.inputConnections.includes(connectionId)
    );

    if (targetNode) {
      if (!visited.has(targetNode.id)) {
        checkCircularDependencies(
          targetNode,
          nodes,
          visited,
          recursionStack,
          errors
        );
      } else if (recursionStack.has(targetNode.id)) {
        errors.push({
          field: `nodes.${node.id}`,
          message: 'Circular dependency detected in workflow',
          code: 'CIRCULAR_DEPENDENCY',
          severity: 'error',
          suggestion: 'Remove the circular connection between nodes'
        });
      }
    }
  });

  recursionStack.delete(node.id);
}

// Export validation functions
export {
  validateWorkflow,
  validateIntegrationConfig,
  ValidationResult
};