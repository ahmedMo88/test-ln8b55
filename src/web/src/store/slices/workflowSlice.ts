/**
 * @fileoverview Redux Toolkit slice for managing workflow state in the frontend application.
 * Implements comprehensive workflow state management with optimistic updates, caching,
 * and real-time execution status tracking.
 * @version 1.0.0
 */

import { createSlice, PayloadAction, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import { produce } from 'immer';

// Internal imports
import { 
  Workflow, 
  WorkflowExecution, 
  WorkflowStatus, 
  WorkflowValidationError,
  WorkflowNode,
  WorkflowConnection
} from '../../types/workflow.types';
import WorkflowService from '../../services/workflow.service';

// Constants
const CACHE_DURATION_MS = 300000; // 5 minutes
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Interface for workflow filters
 */
interface WorkflowFilters {
  status?: WorkflowStatus;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Interface for workflow state with cache management
 */
interface WorkflowState {
  workflows: Workflow[];
  selectedWorkflow: Workflow | null;
  draftChanges: Partial<Workflow> | null;
  executions: Record<string, WorkflowExecution>;
  validationErrors: Record<string, WorkflowValidationError[]>;
  lastFetch: number;
  isLoading: boolean;
  error: string | null;
  filters: WorkflowFilters;
}

// Initial state
const initialState: WorkflowState = {
  workflows: [],
  selectedWorkflow: null,
  draftChanges: null,
  executions: {},
  validationErrors: {},
  lastFetch: 0,
  isLoading: false,
  error: null,
  filters: {
    page: 1,
    limit: 10,
    sortOrder: 'desc',
    sortBy: 'updatedAt'
  }
};

// Create workflow service instance
const workflowService = new WorkflowService();

/**
 * Async thunk for fetching workflows with caching
 */
export const fetchWorkflows = createAsyncThunk(
  'workflow/fetchWorkflows',
  async (filters: WorkflowFilters, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { workflow: WorkflowState };
      const cacheAge = Date.now() - state.workflow.lastFetch;

      // Return cached data if valid
      if (cacheAge < CACHE_DURATION_MS && state.workflow.workflows.length > 0) {
        return { workflows: state.workflow.workflows, fromCache: true };
      }

      const workflows = await workflowService.getWorkflows(filters);
      return { workflows, fromCache: false };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Async thunk for creating new workflow
 */
export const createWorkflow = createAsyncThunk(
  'workflow/createWorkflow',
  async (workflow: Partial<Workflow>, { rejectWithValue }) => {
    try {
      return await workflowService.createWorkflow(workflow);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Async thunk for updating workflow with optimistic updates
 */
export const updateWorkflow = createAsyncThunk(
  'workflow/updateWorkflow',
  async ({ id, updates }: { id: string; updates: Partial<Workflow> }, 
    { dispatch, getState, rejectWithValue }) => {
    const state = getState() as { workflow: WorkflowState };
    const originalWorkflow = state.workflow.workflows.find(w => w.id === id);

    if (!originalWorkflow) {
      return rejectWithValue('Workflow not found');
    }

    // Apply optimistic update
    dispatch(workflowSlice.actions.optimisticUpdateWorkflow({ id, updates }));

    try {
      const updated = await workflowService.updateWorkflow(id, updates);
      return updated;
    } catch (error) {
      // Revert optimistic update on failure
      dispatch(workflowSlice.actions.revertOptimisticUpdate({ id, workflow: originalWorkflow }));
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Async thunk for validating workflow
 */
export const validateWorkflow = createAsyncThunk(
  'workflow/validateWorkflow',
  async (id: string, { rejectWithValue }) => {
    try {
      return await workflowService.validateWorkflow(id);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Create the workflow slice
 */
export const workflowSlice = createSlice({
  name: 'workflow',
  initialState,
  reducers: {
    setFilters: (state, action: PayloadAction<WorkflowFilters>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    
    setSelectedWorkflow: (state, action: PayloadAction<string>) => {
      state.selectedWorkflow = state.workflows.find(w => w.id === action.payload) || null;
      state.draftChanges = null;
    },

    updateDraft: (state, action: PayloadAction<Partial<Workflow>>) => {
      state.draftChanges = { ...state.draftChanges, ...action.payload };
    },

    clearDraft: (state) => {
      state.draftChanges = null;
    },

    optimisticUpdateWorkflow: (state, action: PayloadAction<{ 
      id: string; 
      updates: Partial<Workflow> 
    }>) => {
      const { id, updates } = action.payload;
      const index = state.workflows.findIndex(w => w.id === id);
      if (index !== -1) {
        state.workflows[index] = { ...state.workflows[index], ...updates };
      }
    },

    revertOptimisticUpdate: (state, action: PayloadAction<{
      id: string;
      workflow: Workflow;
    }>) => {
      const { id, workflow } = action.payload;
      const index = state.workflows.findIndex(w => w.id === id);
      if (index !== -1) {
        state.workflows[index] = workflow;
      }
    },

    updateExecutionStatus: (state, action: PayloadAction<WorkflowExecution>) => {
      const execution = action.payload;
      state.executions[execution.workflowId] = execution;
    }
  },
  extraReducers: (builder) => {
    builder
      // Handle fetchWorkflows
      .addCase(fetchWorkflows.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchWorkflows.fulfilled, (state, action) => {
        state.workflows = action.payload.workflows;
        state.lastFetch = Date.now();
        state.isLoading = false;
      })
      .addCase(fetchWorkflows.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })

      // Handle createWorkflow
      .addCase(createWorkflow.fulfilled, (state, action) => {
        state.workflows.unshift(action.payload);
        state.error = null;
      })

      // Handle updateWorkflow
      .addCase(updateWorkflow.fulfilled, (state, action) => {
        const index = state.workflows.findIndex(w => w.id === action.payload.id);
        if (index !== -1) {
          state.workflows[index] = action.payload;
        }
        state.error = null;
      })

      // Handle validateWorkflow
      .addCase(validateWorkflow.fulfilled, (state, action) => {
        if (state.selectedWorkflow) {
          state.validationErrors[state.selectedWorkflow.id] = action.payload;
        }
      });
  }
});

// Export actions
export const { 
  setFilters,
  setSelectedWorkflow,
  updateDraft,
  clearDraft,
  updateExecutionStatus
} = workflowSlice.actions;

// Selectors
export const selectWorkflows = (state: { workflow: WorkflowState }) => state.workflow.workflows;
export const selectSelectedWorkflow = (state: { workflow: WorkflowState }) => state.workflow.selectedWorkflow;
export const selectWorkflowExecution = (workflowId: string) => 
  (state: { workflow: WorkflowState }) => state.workflow.executions[workflowId];

// Memoized selector for workflow with draft changes
export const selectWorkflowWithDraft = createSelector(
  [selectSelectedWorkflow, (state: { workflow: WorkflowState }) => state.workflow.draftChanges],
  (workflow, draftChanges) => {
    if (!workflow) return null;
    return draftChanges ? { ...workflow, ...draftChanges } : workflow;
  }
);

// Export reducer
export default workflowSlice.reducer;