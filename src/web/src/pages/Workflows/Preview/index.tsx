/**
 * @fileoverview Enhanced workflow preview component implementing Material Design 3.0 guidelines
 * with real-time execution monitoring and comprehensive error handling.
 * @version 1.0.0
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Card, 
  Typography, 
  Box, 
  CircularProgress, 
  Alert, 
  Grid, 
  Divider 
} from '@mui/material';
import { ErrorBoundary } from 'react-error-boundary';

// Internal imports
import WorkflowCanvas from '../../../components/workflow/Canvas';
import useWorkflow from '../../../hooks/useWorkflow';
import useWebSocket from '../../../hooks/useWebSocket';

// Constants
const EXECUTION_UPDATE_CHANNEL = '/workflow/execution';
const WEBSOCKET_RECONNECT_DELAY = 5000;
const UPDATE_BATCH_INTERVAL = 100;

/**
 * Interface for execution metrics display
 */
interface ExecutionMetrics {
  duration: string;
  nodesCompleted: number;
  totalNodes: number;
  successRate: string;
  lastUpdated: string;
}

/**
 * Enhanced workflow preview component with real-time execution monitoring
 */
const WorkflowPreview: React.FC = () => {
  const { id: workflowId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // State management
  const [nodeStates, setNodeStates] = useState<Record<string, any>>({});
  const [metrics, setMetrics] = useState<ExecutionMetrics | null>(null);
  const [updateQueue, setUpdateQueue] = useState<any[]>([]);
  const [isProcessingUpdates, setIsProcessingUpdates] = useState(false);

  // Custom hooks
  const { workflow, loading, error } = useWorkflow(workflowId);
  const { 
    isConnected: wsConnected, 
    execution, 
    error: wsError,
    connectionState 
  } = useWebSocket(workflowId);

  /**
   * Processes batched execution updates for performance optimization
   */
  const processUpdateQueue = useCallback(() => {
    if (updateQueue.length === 0 || isProcessingUpdates) return;

    setIsProcessingUpdates(true);
    requestAnimationFrame(() => {
      setUpdateQueue(currentQueue => {
        const updates = currentQueue.reduce((acc, update) => ({
          ...acc,
          [update.nodeId]: update.state
        }), {});

        setNodeStates(current => ({
          ...current,
          ...updates
        }));

        setIsProcessingUpdates(false);
        return [];
      });
    });
  }, [updateQueue, isProcessingUpdates]);

  /**
   * Handles real-time execution updates with batching
   */
  const handleExecutionUpdate = useCallback((execution: any) => {
    if (!execution?.nodeStates) return;

    setUpdateQueue(current => [
      ...current,
      ...Object.entries(execution.nodeStates).map(([nodeId, state]) => ({
        nodeId,
        state
      }))
    ]);

    // Update execution metrics
    setMetrics(formatExecutionMetrics(execution));
  }, []);

  /**
   * Formats execution metrics for display
   */
  const formatExecutionMetrics = useMemo(() => (execution: any): ExecutionMetrics => {
    const startTime = new Date(execution.startTime);
    const endTime = execution.endTime ? new Date(execution.endTime) : new Date();
    const duration = endTime.getTime() - startTime.getTime();

    const nodeStates = Object.values(execution.nodeStates || {});
    const completedNodes = nodeStates.filter(
      (state: any) => state.status === 'completed'
    ).length;

    return {
      duration: `${Math.round(duration / 1000)}s`,
      nodesCompleted: completedNodes,
      totalNodes: nodeStates.length,
      successRate: `${Math.round((completedNodes / nodeStates.length) * 100)}%`,
      lastUpdated: new Date().toLocaleTimeString()
    };
  }, []);

  /**
   * Error boundary fallback component
   */
  const ErrorFallback = ({ error }: { error: Error }) => (
    <Alert severity="error">
      <Typography variant="h6">Error Loading Workflow</Typography>
      <Typography variant="body2">{error.message}</Typography>
    </Alert>
  );

  // Process update queue when updates are available
  useEffect(() => {
    if (updateQueue.length > 0) {
      processUpdateQueue();
    }
  }, [updateQueue, processUpdateQueue]);

  // Handle execution updates from WebSocket
  useEffect(() => {
    if (execution) {
      handleExecutionUpdate(execution);
    }
  }, [execution, handleExecutionUpdate]);

  // Render loading state
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  // Render error state
  if (error) {
    return <ErrorFallback error={error} />;
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Box p={3}>
        <Grid container spacing={3}>
          {/* Header */}
          <Grid item xs={12}>
            <Card>
              <Box p={2}>
                <Typography variant="h5">{workflow?.name}</Typography>
                <Typography variant="body2" color="textSecondary">
                  {workflow?.metadata?.description}
                </Typography>
              </Box>
            </Card>
          </Grid>

          {/* Connection Status */}
          <Grid item xs={12}>
            {!wsConnected && (
              <Alert severity="warning">
                Real-time updates disconnected. Attempting to reconnect...
              </Alert>
            )}
            {wsError && (
              <Alert severity="error">
                Error connecting to real-time updates: {wsError.message}
              </Alert>
            )}
          </Grid>

          {/* Execution Metrics */}
          {metrics && (
            <Grid item xs={12}>
              <Card>
                <Box p={2}>
                  <Grid container spacing={2}>
                    <Grid item xs={3}>
                      <Typography variant="subtitle2">Duration</Typography>
                      <Typography variant="h6">{metrics.duration}</Typography>
                    </Grid>
                    <Grid item xs={3}>
                      <Typography variant="subtitle2">Nodes Completed</Typography>
                      <Typography variant="h6">
                        {metrics.nodesCompleted} / {metrics.totalNodes}
                      </Typography>
                    </Grid>
                    <Grid item xs={3}>
                      <Typography variant="subtitle2">Success Rate</Typography>
                      <Typography variant="h6">{metrics.successRate}</Typography>
                    </Grid>
                    <Grid item xs={3}>
                      <Typography variant="subtitle2">Last Updated</Typography>
                      <Typography variant="h6">{metrics.lastUpdated}</Typography>
                    </Grid>
                  </Grid>
                </Box>
              </Card>
            </Grid>
          )}

          {/* Workflow Canvas */}
          <Grid item xs={12}>
            <Card>
              <Box height="600px">
                <WorkflowCanvas
                  workflowId={workflowId}
                  readOnly={true}
                  executionOverlay={true}
                  nodeStates={nodeStates}
                />
              </Box>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </ErrorBoundary>
  );
};

export default WorkflowPreview;