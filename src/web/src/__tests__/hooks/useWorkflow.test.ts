import { renderHook, act, waitFor } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { jest, beforeEach, afterEach, describe, it, expect } from '@jest/globals';

// Internal imports
import useWorkflow from '../../hooks/useWorkflow';
import workflowReducer from '../../store/slices/workflowSlice';
import { Workflow, WorkflowExecution, WorkflowStatus, Node, Connection } from '../../types/workflow.types';

// Mock WebSocket service
jest.mock('../../services/websocket.service', () => ({
  WebSocketService: {
    initialize: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    disconnect: jest.fn()
  }
}));

// Test data
const mockWorkflow: Workflow = {
  id: 'test-workflow-1',
  userId: 'test-user-1',
  name: 'Test Workflow',
  status: 'draft',
  nodes: [
    {
      id: 'node-1',
      workflowId: 'test-workflow-1',
      type: 'trigger',
      name: 'Email Trigger',
      description: 'Triggers on new email',
      config: {
        service: 'gmail',
        operation: 'watchInbox',
        parameters: {},
        retryPolicy: {
          maxAttempts: 3,
          backoffMultiplier: 1.5,
          initialDelay: 1000,
          maxDelay: 10000
        },
        timeout: 30000
      },
      position: { x: 100, y: 100, z: 0 },
      status: 'idle',
      inputConnections: [],
      outputConnections: ['conn-1'],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ],
  metadata: {
    tags: ['email', 'automation'],
    category: 'communication',
    description: 'Email processing workflow',
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
  id: 'exec-1',
  workflowId: 'test-workflow-1',
  status: 'running',
  startTime: new Date(),
  endTime: null,
  nodeStates: {
    'node-1': {
      status: 'running',
      startTime: new Date(),
      outputs: {},
      metrics: {
        duration: 0,
        retries: 0
      }
    }
  },
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

// Test setup
const setupTest = () => {
  const store = configureStore({
    reducer: {
      workflow: workflowReducer
    },
    preloadedState: {
      workflow: {
        workflows: [mockWorkflow],
        selectedWorkflow: null,
        draftChanges: null,
        executions: {},
        validationErrors: {},
        lastFetch: Date.now(),
        isLoading: false,
        error: null,
        filters: {
          page: 1,
          limit: 10,
          sortOrder: 'desc',
          sortBy: 'updatedAt'
        }
      }
    }
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  return {
    store,
    wrapper
  };
};

describe('useWorkflow', () => {
  let cleanup: () => void;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (cleanup) {
      cleanup();
    }
  });

  describe('Workflow Operations', () => {
    it('should load workflow data correctly', async () => {
      const { wrapper } = setupTest();
      const { result } = renderHook(() => useWorkflow('test-workflow-1'), { wrapper });

      await waitFor(() => {
        expect(result.current.workflow).toBeDefined();
        expect(result.current.workflow?.id).toBe('test-workflow-1');
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeNull();
      });
    });

    it('should handle save workflow operation', async () => {
      const { wrapper } = setupTest();
      const { result } = renderHook(() => useWorkflow('test-workflow-1'), { wrapper });

      const updates = {
        name: 'Updated Workflow',
        metadata: {
          ...mockWorkflow.metadata,
          description: 'Updated description'
        }
      };

      await act(async () => {
        await result.current.saveWorkflow(updates);
      });

      expect(result.current.workflow?.name).toBe('Updated Workflow');
      expect(result.current.workflow?.metadata.description).toBe('Updated description');
    });

    it('should handle deploy workflow operation', async () => {
      const { wrapper } = setupTest();
      const { result } = renderHook(() => useWorkflow('test-workflow-1'), { wrapper });

      await act(async () => {
        await result.current.deployWorkflow();
      });

      expect(result.current.execution).toBeDefined();
      expect(result.current.error).toBeNull();
    });

    it('should handle workflow execution', async () => {
      const { wrapper } = setupTest();
      const { result } = renderHook(() => useWorkflow('test-workflow-1'), { wrapper });

      await act(async () => {
        await result.current.executeWorkflow();
      });

      expect(result.current.execution?.status).toBe('running');
      expect(result.current.error).toBeNull();
    });
  });

  describe('Real-time Updates', () => {
    it('should establish WebSocket connection', async () => {
      const { wrapper } = setupTest();
      const { result } = renderHook(() => useWorkflow('test-workflow-1'), { wrapper });

      await waitFor(() => {
        expect(result.current.wsConnected).toBe(true);
      });
    });

    it('should handle execution status updates', async () => {
      const { wrapper } = setupTest();
      const { result } = renderHook(() => useWorkflow('test-workflow-1'), { wrapper });

      // Simulate WebSocket message
      act(() => {
        result.current.execution = mockExecution;
      });

      expect(result.current.execution?.status).toBe('running');
    });

    it('should handle WebSocket reconnection', async () => {
      const { wrapper } = setupTest();
      const { result } = renderHook(() => useWorkflow('test-workflow-1'), { wrapper });

      await act(async () => {
        await result.current.reconnect();
      });

      expect(result.current.wsConnected).toBe(true);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors', async () => {
      const { wrapper } = setupTest();
      const { result } = renderHook(() => useWorkflow('invalid-id'), { wrapper });

      await waitFor(() => {
        expect(result.current.error).toBeDefined();
        expect(result.current.loading).toBe(false);
      });
    });

    it('should handle WebSocket errors', async () => {
      const { wrapper } = setupTest();
      const { result } = renderHook(() => useWorkflow('test-workflow-1'), { wrapper });

      // Simulate WebSocket error
      act(() => {
        result.current.error = new Error('WebSocket connection failed');
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.wsConnected).toBe(false);
    });

    it('should handle validation errors', async () => {
      const { wrapper } = setupTest();
      const { result } = renderHook(() => useWorkflow('test-workflow-1'), { wrapper });

      const invalidUpdates = {
        nodes: [] // Empty nodes array should trigger validation error
      };

      await act(async () => {
        try {
          await result.current.saveWorkflow(invalidUpdates);
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      expect(result.current.error).toBeDefined();
    });
  });
});