/**
 * @fileoverview Enhanced workflow editor toolbar component providing quick access to
 * common workflow operations with real-time feedback, loading states, and accessibility.
 * @version 1.0.0
 */

import React, { useCallback, useMemo, useState } from 'react'; // v18.2.0
import { Stack, Tooltip } from '@mui/material'; // v5.14.0
import { styled } from '@mui/material/styles'; // v5.14.0
import SaveIcon from '@mui/icons-material/Save';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PublishIcon from '@mui/icons-material/Publish';
import CustomButton from '../../common/Button';
import useWorkflow from '../../../hooks/useWorkflow';

/**
 * Interface for toolbar component props
 */
export interface ToolbarProps {
  workflowId: string;
  onSave?: () => Promise<void>;
  onDeploy?: () => Promise<void>;
  onExecute?: () => Promise<void>;
  disabled?: boolean;
  className?: string;
}

/**
 * Styled container for toolbar with theme integration
 */
const ToolbarContainer = styled(Stack)(({ theme }) => ({
  padding: '8px 16px',
  borderBottom: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
  position: 'sticky',
  top: 0,
  zIndex: 100,
  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
  '& .MuiButton-root': {
    minWidth: '100px'
  }
}));

/**
 * Enhanced workflow editor toolbar component with real-time feedback
 * and comprehensive error handling
 */
export const Toolbar = React.memo<ToolbarProps>(({
  workflowId,
  onSave,
  onDeploy,
  onExecute,
  disabled = false,
  className
}) => {
  // State management
  const [isSaving, setIsSaving] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  // Hook integration
  const {
    workflow,
    loading: workflowLoading,
    error: workflowError,
    saveWorkflow,
    deployWorkflow,
    executeWorkflow
  } = useWorkflow(workflowId);

  /**
   * Handles workflow save operation with error handling
   */
  const handleSave = useCallback(async () => {
    if (!workflow || disabled || isSaving) return;

    try {
      setIsSaving(true);
      await saveWorkflow({});
      onSave?.();
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  }, [workflow, disabled, isSaving, saveWorkflow, onSave]);

  /**
   * Handles workflow deployment with validation
   */
  const handleDeploy = useCallback(async () => {
    if (!workflow || disabled || isDeploying) return;

    try {
      setIsDeploying(true);
      await deployWorkflow();
      onDeploy?.();
    } catch (error) {
      console.error('Deployment failed:', error);
    } finally {
      setIsDeploying(false);
    }
  }, [workflow, disabled, isDeploying, deployWorkflow, onDeploy]);

  /**
   * Handles workflow execution with real-time feedback
   */
  const handleExecute = useCallback(async () => {
    if (!workflow || disabled || isExecuting) return;

    try {
      setIsExecuting(true);
      await executeWorkflow();
      onExecute?.();
    } catch (error) {
      console.error('Execution failed:', error);
    } finally {
      setIsExecuting(false);
    }
  }, [workflow, disabled, isExecuting, executeWorkflow, onExecute]);

  /**
   * Memoized button states for performance optimization
   */
  const buttonStates = useMemo(() => ({
    save: {
      disabled: disabled || !workflow || workflowLoading || isSaving,
      loading: isSaving,
      tooltip: workflowError ? 'Unable to save workflow' : 'Save workflow'
    },
    deploy: {
      disabled: disabled || !workflow || workflowLoading || isDeploying,
      loading: isDeploying,
      tooltip: workflowError ? 'Unable to deploy workflow' : 'Deploy workflow'
    },
    execute: {
      disabled: disabled || !workflow || workflowLoading || isExecuting,
      loading: isExecuting,
      tooltip: workflowError ? 'Unable to execute workflow' : 'Execute workflow'
    }
  }), [
    disabled,
    workflow,
    workflowLoading,
    workflowError,
    isSaving,
    isDeploying,
    isExecuting
  ]);

  return (
    <ToolbarContainer
      direction="row"
      spacing={2}
      alignItems="center"
      className={className}
      role="toolbar"
      aria-label="Workflow actions"
    >
      <Tooltip title={buttonStates.save.tooltip}>
        <span>
          <CustomButton
            variant="contained"
            color="primary"
            onClick={handleSave}
            disabled={buttonStates.save.disabled}
            loading={buttonStates.save.loading}
            startIcon={<SaveIcon />}
            aria-label="Save workflow"
          >
            Save
          </CustomButton>
        </span>
      </Tooltip>

      <Tooltip title={buttonStates.deploy.tooltip}>
        <span>
          <CustomButton
            variant="contained"
            color="secondary"
            onClick={handleDeploy}
            disabled={buttonStates.deploy.disabled}
            loading={buttonStates.deploy.loading}
            startIcon={<PublishIcon />}
            aria-label="Deploy workflow"
          >
            Deploy
          </CustomButton>
        </span>
      </Tooltip>

      <Tooltip title={buttonStates.execute.tooltip}>
        <span>
          <CustomButton
            variant="contained"
            color="success"
            onClick={handleExecute}
            disabled={buttonStates.execute.disabled}
            loading={buttonStates.execute.loading}
            startIcon={<PlayArrowIcon />}
            aria-label="Execute workflow"
          >
            Execute
          </CustomButton>
        </span>
      </Tooltip>
    </ToolbarContainer>
  );
});

// Display name for debugging
Toolbar.displayName = 'Toolbar';

export default Toolbar;