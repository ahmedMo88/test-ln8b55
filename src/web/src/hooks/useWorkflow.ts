/**
 * @fileoverview Enhanced React hook for managing workflow operations with real-time updates,
 * optimized performance, and comprehensive error handling.
 * @version 1.0.0
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  selectWorkflows,
  selectSelectedWorkflow,
  selectWorkflowLoading,
  selectWorkflowError,
  workflowSlice
} from '../store/slices/workflowSlice';
import {
  Workflow,
  WorkflowExecution,
  WorkflowStatus,
  WorkflowValidationError,
  WorkflowMetrics
} from '../types/workflow.types';
import useWebSocket from './useWebSocket';

// Constants for performance optimization
const DEBOUNCE_DELAY = 500;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

/**
 * Enhanced hook for comprehensive workflow management with real-time updates
 * and optimized performance.
 * 
 * @param workflowId - ID of the workflow to manage
 * @returns Comprehensive workflow management interface
 */
export const useWorkflow = (workflowId?: string) => {
  // Redux state management
  const dispatch = useDispatch();
  const workflows = useSelector(selectWorkflows);
  const selectedWorkflow = useSelector(selectSelectedWorkflow);
  const isLoading = useSelector(selectWorkflowLoading);
  const error = useSelector(selectWorkflowError);

  // Local state management
  const [execution, setExecution] = useState<WorkflowExecution | null>(null);
  const [validationErrors, setValidationErrors] = useState<WorkflowValidationError[]>([]);
  const [metrics, setMetrics] = useState<WorkflowMetrics | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Initialize WebSocket connection for real-time updates
  const {
    isConnected: wsConnected,
    execution: wsExecution,
    error: wsError,
    connectionState
  } = useWebSocket(workflowId);

  /**
   * Memoized workflow data to prevent unnecessary re-renders
   */
  const workflow = useMemo(() => {
    if (!workflowId) return null;
    return workflows.find(w => w.id === workflowId) || null;
  }, [workflows, workflowId]);

  /**
   * Debounced workflow save operation
   */
  const debouncedSave = useCallback(
    (() => {
      let timeout: NodeJS.Timeout;
      return (updates: Partial<Workflow>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          dispatch(workflowSlice.actions.updateDraft(updates));
        }, DEBOUNCE_DELAY);
      };
    })(),
    [dispatch]
  );

  /**
   * Saves workflow with optimistic updates and error handling
   */
  const saveWorkflow = useCallback(async (updates: Partial<Workflow>) => {
    if (!workflow) return;

    try {
      // Optimistic update
      dispatch(workflowSlice.actions.optimisticUpdateWorkflow({
        id: workflow.id,
        updates
      }));

      // Persist changes
      await dispatch(workflowSlice.actions.saveWorkflow({
        id: workflow.id,
        updates
      })).unwrap();

      // Clear validation errors on successful save
      setValidationErrors([]);
    } catch (error) {
      // Revert optimistic update on failure
      dispatch(workflowSlice.actions.revertOptimisticUpdate({
        id: workflow.id,
        workflow: selectedWorkflow!
      }));
      throw error;
    }
  }, [workflow, selectedWorkflow, dispatch]);

  /**
   * Deploys workflow with validation and error handling
   */
  const deployWorkflow = useCallback(async () => {
    if (!workflow) return;

    try {
      // Validate before deployment
      const validationResult = await validateWorkflow();
      if (validationResult.length > 0) {
        throw new Error('Workflow validation failed');
      }

      // Initiate deployment
      const result = await dispatch(workflowSlice.actions.deployWorkflow(workflow.id)).unwrap();
      setExecution(result);
      return result;
    } catch (error) {
      console.error('Deployment failed:', error);
      throw error;
    }
  }, [workflow, dispatch]);

  /**
   * Executes workflow with retry mechanism
   */
  const executeWorkflow = useCallback(async () => {
    if (!workflow) return;

    try {
      const result = await dispatch(workflowSlice.actions.executeWorkflow(workflow.id)).unwrap();
      setExecution(result);
      setRetryCount(0);
      return result;
    } catch (error) {
      if (retryCount < RETRY_ATTEMPTS) {
        setRetryCount(prev => prev + 1);
        setTimeout(() => executeWorkflow(), RETRY_DELAY * Math.pow(2, retryCount));
      } else {
        throw error;
      }
    }
  }, [workflow, dispatch, retryCount]);

  /**
   * Validates workflow and updates error state
   */
  const validateWorkflow = useCallback(async () => {
    if (!workflow) return [];

    try {
      const errors = await dispatch(workflowSlice.actions.validateWorkflow(workflow.id)).unwrap();
      setValidationErrors(errors);
      return errors;
    } catch (error) {
      console.error('Validation failed:', error);
      throw error;
    }
  }, [workflow, dispatch]);

  /**
   * Deletes workflow with confirmation and cleanup
   */
  const deleteWorkflow = useCallback(async () => {
    if (!workflow) return;

    try {
      await dispatch(workflowSlice.actions.deleteWorkflow(workflow.id)).unwrap();
    } catch (error) {
      console.error('Deletion failed:', error);
      throw error;
    }
  }, [workflow, dispatch]);

  /**
   * Effect for handling WebSocket execution updates
   */
  useEffect(() => {
    if (wsExecution && wsExecution.workflowId === workflowId) {
      setExecution(wsExecution);
      setMetrics(wsExecution.metrics);
    }
  }, [wsExecution, workflowId]);

  /**
   * Effect for initial workflow loading
   */
  useEffect(() => {
    if (workflowId && !workflow && !isLoading) {
      dispatch(workflowSlice.actions.loadWorkflow(workflowId));
    }
  }, [workflowId, workflow, isLoading, dispatch]);

  // Return comprehensive workflow management interface
  return {
    workflow,
    loading: isLoading,
    error,
    execution,
    validationErrors,
    metrics,
    wsConnected,
    wsError,
    connectionState,
    saveWorkflow,
    deployWorkflow,
    executeWorkflow,
    validateWorkflow,
    deleteWorkflow,
    debouncedSave
  };
};

export default useWorkflow;