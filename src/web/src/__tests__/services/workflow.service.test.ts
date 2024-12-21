/**
 * @fileoverview Comprehensive test suite for WorkflowService class implementing
 * extensive test coverage for workflow operations including CRUD, deployment,
 * execution, status monitoring, caching, and error handling scenarios.
 * @version 1.0.0
 */

import { jest, describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import { WebSocket } from 'ws'; // v8.14.2
import WorkflowService from '../../services/workflow.service';
import { ApiService } from '../../services/api';
import { 
  Workflow, 
  WorkflowExecution, 
  WorkflowStatus,
  WorkflowValidationError 
} from '../../types/workflow.types';
import { Node, NodeType } from '../../types/node.types';

// Mock the external dependencies
jest.mock('../../services/api');
jest.mock('ws');

// Test data setup
const mockWorkflow: Workflow = {
  id: 'test-workflow-1',
  userId: 'test-user-1',
  name: 'Test Workflow',
  status: 'draft',
  nodes: [],
  metadata: {
    tags: ['test'],
    category: 'test',
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

const mockExecution: WorkflowExecution = {
  id: 'test-execution-1',
  workflowId: 'test-workflow-1',
  status: 'running',
  startTime: new Date(),
  endTime: null,
  nodeStates: {},
  error: null,
  metrics: {
    executionTime: 0,
    nodeExecutionTimes: {},
    resourceUsage: {
      memory: 0,
      cpu: 0
    }
  },
  retryCount: 0
};

describe('WorkflowService', () => {
  let workflowService: WorkflowService;
  let mockApiService: jest.Mocked<ApiService>;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    mockApiService = new ApiService() as jest.Mocked<ApiService>;
    workflowService = new WorkflowService(mockApiService, {
      baseUrl: 'http://localhost:8080'
    });
  });

  afterEach(() => {
    // Clean up after each test
    jest.resetAllMocks();
  });

  describe('CRUD Operations', () => {
    it('should retrieve workflows with pagination', async () => {
      const mockResponse = [mockWorkflow];
      mockApiService.get.mockResolvedValueOnce(mockResponse);

      const filters = { page: 1, limit: 10 };
      const result = await workflowService.getWorkflows(filters);

      expect(mockApiService.get).toHaveBeenCalledWith(
        expect.stringContaining('/workflows'),
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse);
    });

    it('should create new workflow with validation', async () => {
      mockApiService.post.mockResolvedValueOnce(mockWorkflow);

      const newWorkflow = { ...mockWorkflow, id: undefined };
      const result = await workflowService.createWorkflow(newWorkflow);

      expect(mockApiService.post).toHaveBeenCalledWith(
        expect.stringContaining('/workflows'),
        expect.objectContaining({ name: newWorkflow.name })
      );
      expect(result).toEqual(mockWorkflow);
    });

    it('should update workflow with proper versioning', async () => {
      const updatedWorkflow = { ...mockWorkflow, version: 2 };
      mockApiService.put.mockResolvedValueOnce(updatedWorkflow);

      const result = await workflowService.updateWorkflow(mockWorkflow.id, {
        name: 'Updated Workflow'
      });

      expect(mockApiService.put).toHaveBeenCalledWith(
        expect.stringContaining(`/workflows/${mockWorkflow.id}`),
        expect.objectContaining({ name: 'Updated Workflow' })
      );
      expect(result).toEqual(updatedWorkflow);
    });

    it('should delete workflow and related resources', async () => {
      mockApiService.delete.mockResolvedValueOnce({});

      await workflowService.deleteWorkflow(mockWorkflow.id);

      expect(mockApiService.delete).toHaveBeenCalledWith(
        expect.stringContaining(`/workflows/${mockWorkflow.id}`)
      );
    });
  });

  describe('Workflow Execution', () => {
    it('should deploy workflow with validation', async () => {
      mockApiService.post.mockResolvedValueOnce(mockExecution);

      const result = await workflowService.deployWorkflow(mockWorkflow.id);

      expect(mockApiService.post).toHaveBeenCalledWith(
        expect.stringContaining(`/workflows/${mockWorkflow.id}/deploy`)
      );
      expect(result).toEqual(mockExecution);
    });

    it('should handle execution status updates', async () => {
      const mockStatus = { ...mockExecution, status: 'completed' as const };
      mockApiService.get.mockResolvedValueOnce(mockStatus);

      const result = await workflowService.getExecutionStatus(mockExecution.id);

      expect(mockApiService.get).toHaveBeenCalledWith(
        expect.stringContaining(`/executions/${mockExecution.id}/status`)
      );
      expect(result).toEqual(mockStatus);
    });

    it('should validate workflow before deployment', async () => {
      const mockValidation: WorkflowValidationError[] = [];
      mockApiService.post.mockResolvedValueOnce(mockValidation);

      const result = await workflowService.validateWorkflow(mockWorkflow.id);

      expect(mockApiService.post).toHaveBeenCalledWith(
        expect.stringContaining(`/workflows/${mockWorkflow.id}/validate`)
      );
      expect(result).toEqual(mockValidation);
    });
  });

  describe('WebSocket Integration', () => {
    it('should establish WebSocket connection for real-time updates', () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();

      const unsubscribe = workflowService.subscribeToExecutionUpdates(
        mockWorkflow.id,
        onUpdate,
        onError
      );

      expect(WebSocket).toHaveBeenCalledWith(
        expect.stringContaining(`/ws/workflows/${mockWorkflow.id}/executions`)
      );
      
      // Simulate WebSocket message
      const mockWs = (WebSocket as jest.Mock).mock.instances[0];
      mockWs.onmessage({ data: JSON.stringify(mockExecution) });

      expect(onUpdate).toHaveBeenCalledWith(mockExecution);
      
      // Clean up subscription
      unsubscribe();
      expect(mockWs.close).toHaveBeenCalled();
    });

    it('should handle WebSocket connection errors', () => {
      const onUpdate = jest.fn();
      const onError = jest.fn();

      workflowService.subscribeToExecutionUpdates(
        mockWorkflow.id,
        onUpdate,
        onError
      );

      // Simulate WebSocket error
      const mockWs = (WebSocket as jest.Mock).mock.instances[0];
      mockWs.onerror(new Error('Connection failed'));

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'WebSocket connection error' })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const networkError = new Error('Network error');
      mockApiService.get.mockRejectedValueOnce(networkError);

      await expect(workflowService.getWorkflows()).rejects.toThrow('Network error');
    });

    it('should handle validation errors', async () => {
      const validationError = {
        message: 'Invalid workflow configuration',
        code: 422
      };
      mockApiService.post.mockRejectedValueOnce(validationError);

      await expect(
        workflowService.createWorkflow(mockWorkflow)
      ).rejects.toEqual(expect.objectContaining(validationError));
    });

    it('should implement retry logic for transient errors', async () => {
      const transientError = { code: 'ETIMEDOUT' };
      mockApiService.get
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce([mockWorkflow]);

      const result = await workflowService.getWorkflows();

      expect(mockApiService.get).toHaveBeenCalledTimes(2);
      expect(result).toEqual([mockWorkflow]);
    });
  });

  describe('Cache Management', () => {
    it('should cache workflow data', async () => {
      mockApiService.get
        .mockResolvedValueOnce([mockWorkflow])
        .mockResolvedValueOnce([mockWorkflow]);

      // First call should hit the API
      await workflowService.getWorkflows();
      expect(mockApiService.get).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await workflowService.getWorkflows();
      expect(mockApiService.get).toHaveBeenCalledTimes(1);
    });

    it('should invalidate cache on workflow updates', async () => {
      mockApiService.put.mockResolvedValueOnce(mockWorkflow);
      mockApiService.get
        .mockResolvedValueOnce([mockWorkflow])
        .mockResolvedValueOnce([mockWorkflow]);

      // Cache initial data
      await workflowService.getWorkflows();

      // Update workflow
      await workflowService.updateWorkflow(mockWorkflow.id, { name: 'Updated' });

      // Next get should bypass cache
      await workflowService.getWorkflows();
      expect(mockApiService.get).toHaveBeenCalledTimes(2);
    });
  });
});