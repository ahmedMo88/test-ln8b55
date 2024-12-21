/**
 * @fileoverview Enhanced workflow editor page component implementing Material Design 3.0 guidelines
 * with comprehensive drag-and-drop support, real-time validation, and accessibility features.
 * @version 1.0.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Box, CircularProgress, Snackbar, Alert, Tooltip } from '@mui/material';
import { useAnalytics } from '@analytics/react';

// Internal imports
import WorkflowCanvas from '../../../components/workflow/Canvas';
import useWorkflow from '../../../hooks/useWorkflow';
import useWebSocket from '../../../hooks/useWebSocket';
import { WorkflowValidationError } from '../../../types/workflow.types';

// Constants for configuration
const AUTOSAVE_DELAY = 1000;
const ERROR_DISPLAY_DURATION = 6000;

/**
 * Props interface for the Editor component
 */
interface EditorProps {
  readOnly?: boolean;
  onError?: (error: Error) => void;
}

/**
 * Enhanced workflow editor page component with comprehensive editing capabilities,
 * real-time validation, and accessibility features.
 */
const WorkflowEditor: React.FC<EditorProps> = ({
  readOnly = false,
  onError
}) => {
  // State management
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<WorkflowValidationError[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Custom hooks
  const analytics = useAnalytics();
  const { 
    workflow,
    loading,
    error: workflowError,
    execution,
    saveWorkflow,
    validateWorkflow,
    debouncedSave
  } = useWorkflow();

  // WebSocket connection for real-time updates
  const {
    isConnected: wsConnected,
    execution: wsExecution,
    error: wsError,
    connectionState
  } = useWebSocket(workflow?.id);

  /**
   * Handles workflow validation with error tracking
   */
  const handleValidation = useCallback(async () => {
    try {
      if (!workflow?.id) return;
      const errors = await validateWorkflow();
      setValidationErrors(errors);

      if (errors.length > 0) {
        setErrorMessage('Workflow validation failed. Please check the errors.');
        analytics.track('workflow_validation_failed', {
          workflowId: workflow.id,
          errorCount: errors.length
        });
      }
    } catch (error) {
      console.error('Validation error:', error);
      onError?.(error as Error);
    }
  }, [workflow?.id, validateWorkflow, analytics, onError]);

  /**
   * Handles node selection with analytics tracking
   */
  const handleNodeSelect = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    analytics.track('workflow_node_selected', {
      nodeId,
      workflowId: workflow?.id
    });
  }, [workflow?.id, analytics]);

  /**
   * Handles workflow changes with debounced saving
   */
  const handleWorkflowChange = useCallback((updates: any) => {
    if (readOnly) return;

    debouncedSave(updates);
    analytics.track('workflow_updated', {
      workflowId: workflow?.id,
      updateType: Object.keys(updates)[0]
    });
  }, [workflow?.id, debouncedSave, readOnly, analytics]);

  /**
   * Handles validation errors with user feedback
   */
  const handleValidationError = useCallback((error: WorkflowValidationError) => {
    setValidationErrors(prev => [...prev, error]);
    setErrorMessage(error.message);
    
    analytics.track('workflow_validation_error', {
      workflowId: workflow?.id,
      errorType: error.code,
      nodeId: error.nodeId
    });
  }, [workflow?.id, analytics]);

  /**
   * Effect for handling WebSocket execution updates
   */
  useEffect(() => {
    if (wsExecution) {
      analytics.track('workflow_execution_update', {
        workflowId: workflow?.id,
        status: wsExecution.status
      });
    }
  }, [wsExecution, workflow?.id, analytics]);

  /**
   * Effect for handling errors
   */
  useEffect(() => {
    if (workflowError || wsError) {
      const error = workflowError || wsError;
      setErrorMessage(error?.message || 'An error occurred');
      onError?.(error as Error);
    }
  }, [workflowError, wsError, onError]);

  /**
   * Memoized editor content for performance
   */
  const editorContent = useMemo(() => {
    if (loading) {
      return (
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          height="100%"
        >
          <CircularProgress />
        </Box>
      );
    }

    return (
      <WorkflowCanvas
        workflowId={workflow?.id || ''}
        readOnly={readOnly}
        onNodeSelect={handleNodeSelect}
        onValidationError={handleValidationError}
        onWorkflowChange={handleWorkflowChange}
      />
    );
  }, [
    loading,
    workflow?.id,
    readOnly,
    handleNodeSelect,
    handleValidationError,
    handleWorkflowChange
  ]);

  return (
    <Box
      ref={editorRef}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        bgcolor: 'background.default'
      }}
      role="main"
      aria-label="Workflow Editor"
    >
      {editorContent}

      {/* Error notifications */}
      <Snackbar
        open={!!errorMessage}
        autoHideDuration={ERROR_DISPLAY_DURATION}
        onClose={() => setErrorMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="error"
          onClose={() => setErrorMessage(null)}
          variant="filled"
        >
          {errorMessage}
        </Alert>
      </Snackbar>

      {/* WebSocket connection status */}
      {!wsConnected && (
        <Tooltip title="Reconnecting to server...">
          <Box
            sx={{
              position: 'absolute',
              bottom: 16,
              right: 16,
              zIndex: 1000
            }}
          >
            <CircularProgress size={24} />
          </Box>
        </Tooltip>
      )}
    </Box>
  );
};

// Display name for debugging
WorkflowEditor.displayName = 'WorkflowEditor';

export default WorkflowEditor;