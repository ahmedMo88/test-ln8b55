/**
 * @fileoverview Comprehensive test suite for Redux workflow slice
 * Tests state management, async operations, selectors, and error handling
 * @version 1.0.0
 */

import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  workflowSlice,
  reducer,
  actions,
  fetchWorkflows,
  createWorkflow,
  updateWorkflow,
  selectWorkflows,
  selectSelectedWorkflow,
  selectWorkflowLoading,
  selectWorkflowError
} from '../../store/slices/workflowSlice';
import { Workflow, WorkflowStatus, WorkflowValidationError } from '../../types/workflow.types';
import WorkflowService from '../../services/workflow.service';

// Mock WorkflowService
jest.mock('../../services/workflow.service');

// Test data
const mockWorkflow: Workflow = {
  id: '123',
  userId: 'user123',
  name: 'Test Workflow',
  status: 'draft' as WorkflowStatus,
  nodes: [],
  metadata: {
    tags: [],
    category: 'test',
    description: 'Test workflow',
    version: 1,
    lastModifiedBy: 'user123',
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

/**
 * Creates a configured test store with workflow reducer
 */
const setupTestStore = () => {
  return configureStore({
    reducer: {
      workflow: reducer
    }
  });
};

/**
 * Sets up WorkflowService mock with predefined responses
 */
const mockWorkflowService = () => {
  const mockService = new WorkflowService({} as any) as jest.Mocked<WorkflowService>;
  mockService.getWorkflows.mockResolvedValue([mockWorkflow]);
  mockService.createWorkflow.mockResolvedValue(mockWorkflow);
  mockService.updateWorkflow.mockResolvedValue(mockWorkflow);
  mockService.validateWorkflow.mockResolvedValue([]);
  return mockService;
};

describe('workflowSlice', () => {
  let store: ReturnType<typeof setupTestStore>;
  let workflowService: jest.Mocked<WorkflowService>;

  beforeEach(() => {
    store = setupTestStore();
    workflowService = mockWorkflowService();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState().workflow;
      expect(state.workflows).toEqual([]);
      expect(state.selectedWorkflow).toBeNull();
      expect(state.draftChanges).toBeNull();
      expect(state.executions).toEqual({});
      expect(state.validationErrors).toEqual({});
      expect(state.isLoading).toBeFalsy();
      expect(state.error).toBeNull();
    });
  });

  describe('async thunks', () => {
    describe('fetchWorkflows', () => {
      it('should handle fetchWorkflows.pending', async () => {
        const promise = store.dispatch(fetchWorkflows({}));
        expect(store.getState().workflow.isLoading).toBeTruthy();
        await promise;
      });

      it('should handle fetchWorkflows.fulfilled', async () => {
        await store.dispatch(fetchWorkflows({}));
        const state = store.getState().workflow;
        expect(state.workflows).toEqual([mockWorkflow]);
        expect(state.isLoading).toBeFalsy();
        expect(state.error).toBeNull();
      });

      it('should handle fetchWorkflows.rejected', async () => {
        const error = new Error('Network error');
        workflowService.getWorkflows.mockRejectedValueOnce(error);
        await store.dispatch(fetchWorkflows({}));
        const state = store.getState().workflow;
        expect(state.error).toBe(error.message);
        expect(state.isLoading).toBeFalsy();
      });
    });

    describe('createWorkflow', () => {
      it('should handle createWorkflow.fulfilled', async () => {
        await store.dispatch(createWorkflow({ name: 'New Workflow' }));
        const state = store.getState().workflow;
        expect(state.workflows).toContainEqual(mockWorkflow);
        expect(state.error).toBeNull();
      });

      it('should handle createWorkflow.rejected', async () => {
        const error = new Error('Validation error');
        workflowService.createWorkflow.mockRejectedValueOnce(error);
        await store.dispatch(createWorkflow({ name: 'Invalid Workflow' }));
        expect(store.getState().workflow.error).toBe(error.message);
      });
    });

    describe('updateWorkflow', () => {
      it('should handle updateWorkflow.fulfilled', async () => {
        const updates = { name: 'Updated Workflow' };
        await store.dispatch(updateWorkflow({ id: '123', updates }));
        const state = store.getState().workflow;
        expect(state.error).toBeNull();
      });

      it('should handle optimistic updates', async () => {
        const updates = { name: 'Optimistic Update' };
        const promise = store.dispatch(updateWorkflow({ id: '123', updates }));
        const stateAfterOptimistic = store.getState().workflow;
        expect(stateAfterOptimistic.workflows.find(w => w.id === '123')?.name).toBe(updates.name);
        await promise;
      });
    });
  });

  describe('reducers', () => {
    it('should handle setSelectedWorkflow', () => {
      store.dispatch(actions.setSelectedWorkflow('123'));
      const state = store.getState().workflow;
      expect(state.selectedWorkflow).toBeNull();
      expect(state.draftChanges).toBeNull();
    });

    it('should handle updateDraft', () => {
      const draftChanges = { name: 'Draft Changes' };
      store.dispatch(actions.updateDraft(draftChanges));
      expect(store.getState().workflow.draftChanges).toEqual(draftChanges);
    });

    it('should handle clearDraft', () => {
      store.dispatch(actions.updateDraft({ name: 'Draft' }));
      store.dispatch(actions.clearDraft());
      expect(store.getState().workflow.draftChanges).toBeNull();
    });

    it('should handle updateExecutionStatus', () => {
      const execution = {
        id: 'exec123',
        workflowId: '123',
        status: 'running' as const,
        startTime: new Date(),
        endTime: null,
        nodeStates: {},
        error: null,
        metrics: {
          executionTime: 0,
          nodeExecutionTimes: {},
          resourceUsage: { memory: 0, cpu: 0 }
        },
        retryCount: 0
      };
      store.dispatch(actions.updateExecutionStatus(execution));
      expect(store.getState().workflow.executions['123']).toEqual(execution);
    });
  });

  describe('selectors', () => {
    beforeEach(async () => {
      await store.dispatch(fetchWorkflows({}));
    });

    it('should select workflows', () => {
      const workflows = selectWorkflows(store.getState());
      expect(workflows).toEqual([mockWorkflow]);
    });

    it('should select selected workflow', () => {
      const selected = selectSelectedWorkflow(store.getState());
      expect(selected).toBeNull();
    });

    it('should select loading state', () => {
      const loading = selectWorkflowLoading(store.getState());
      expect(loading).toBeFalsy();
    });

    it('should select error state', () => {
      const error = selectWorkflowError(store.getState());
      expect(error).toBeNull();
    });
  });
});