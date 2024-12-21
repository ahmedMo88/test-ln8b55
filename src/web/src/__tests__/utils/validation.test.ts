/**
 * @fileoverview Test suite for workflow, node, and integration configuration validation utilities
 * @version 1.0.0
 */

import { describe, test, expect } from '@jest/globals'; // v29.7.0
import { 
  validateWorkflow, 
  validateIntegrationConfig 
} from '../../utils/validation';
import { 
  Workflow, 
  WorkflowStatus,
  WorkflowMetadata 
} from '../../types/workflow.types';
import { 
  Node, 
  NodeType,
  createEmptyNode 
} from '../../types/node.types';
import { 
  ServiceType, 
  AuthType,
  IntegrationConfig 
} from '../../types/integration.types';

describe('validateWorkflow', () => {
  test('should validate a valid workflow structure', () => {
    const workflow: Workflow = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
      name: 'Test Workflow',
      status: 'active' as WorkflowStatus,
      nodes: [
        createEmptyNode('123e4567-e89b-12d3-a456-426614174000', 'trigger'),
        createEmptyNode('123e4567-e89b-12d3-a456-426614174000', 'action')
      ],
      metadata: {
        tags: ['test', 'automation'],
        category: 'testing',
        description: 'Test workflow description',
        version: 1,
        lastModifiedBy: 'test-user',
        isTemplate: false
      },
      version: 1,
      lastExecutedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      permissions: {
        canView: true,
        canEdit: true,
        canExecute: true,
        canDelete: true,
        canShare: true
      },
      schedule: null
    };

    const result = validateWorkflow(workflow);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should detect missing workflow metadata', () => {
    const workflow: Workflow = {
      ...createBasicWorkflow(),
      metadata: {
        tags: [],
        category: '',
        description: '',
        version: 1,
        lastModifiedBy: 'test-user',
        isTemplate: false
      }
    };

    const result = validateWorkflow(workflow);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      field: 'metadata.description',
      code: 'DESCRIPTION_MISSING'
    }));
    expect(result.warnings).toContainEqual(expect.objectContaining({
      field: 'metadata.tags',
      code: 'TAGS_MISSING'
    }));
  });

  test('should detect circular dependencies in workflow', () => {
    const nodeA = createEmptyNode('workflow-1', 'action');
    const nodeB = createEmptyNode('workflow-1', 'action');
    nodeA.outputConnections = [nodeB.id];
    nodeB.outputConnections = [nodeA.id];
    nodeA.inputConnections = [nodeB.id];
    nodeB.inputConnections = [nodeA.id];

    const workflow = createBasicWorkflow();
    workflow.nodes = [nodeA, nodeB];

    const result = validateWorkflow(workflow);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'CIRCULAR_DEPENDENCY'
    }));
  });
});

describe('validateIntegrationConfig', () => {
  test('should validate valid integration configuration', () => {
    const config: IntegrationConfig = {
      serviceType: ServiceType.EMAIL,
      authType: AuthType.OAUTH2,
      settings: {
        domain: 'test.com',
        port: 587,
        useTLS: true
      },
      rateLimits: {
        requestsPerMinute: 50,
        burstLimit: 10
      }
    };

    const result = validateIntegrationConfig(config);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('should detect invalid rate limits', () => {
    const config: IntegrationConfig = {
      serviceType: ServiceType.EMAIL,
      authType: AuthType.OAUTH2,
      settings: {},
      rateLimits: {
        requestsPerMinute: 200 // Exceeds email service limit of 100
      }
    };

    const result = validateIntegrationConfig(config);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: 'RATE_LIMIT_HIGH',
      field: 'rateLimits.requestsPerMinute'
    }));
  });

  test('should detect invalid authentication type', () => {
    const config: IntegrationConfig = {
      serviceType: ServiceType.EMAIL,
      authType: AuthType.API_KEY, // Email service requires OAuth2
      settings: {},
      rateLimits: {
        requestsPerMinute: 50
      }
    };

    const result = validateIntegrationConfig(config);
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'AUTH_TYPE_INVALID',
      field: 'authType'
    }));
  });

  test('should validate service-specific settings', () => {
    const config: IntegrationConfig = {
      serviceType: ServiceType.AI_SERVICE,
      authType: AuthType.API_KEY,
      settings: {
        model: 'gpt-4',
        maxTokens: 2000
      },
      rateLimits: {
        requestsPerMinute: 30
      }
    };

    const result = validateIntegrationConfig(config);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// Helper function to create a basic workflow for testing
function createBasicWorkflow(): Workflow {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    userId: '123e4567-e89b-12d3-a456-426614174001',
    name: 'Test Workflow',
    status: 'draft' as WorkflowStatus,
    nodes: [],
    metadata: {
      tags: ['test'],
      category: 'testing',
      description: 'Test workflow',
      version: 1,
      lastModifiedBy: 'test-user',
      isTemplate: false
    },
    version: 1,
    lastExecutedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    permissions: {
      canView: true,
      canEdit: true,
      canExecute: true,
      canDelete: true,
      canShare: true
    },
    schedule: null
  };
}