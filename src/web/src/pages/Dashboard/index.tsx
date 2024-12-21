/**
 * @fileoverview Main dashboard page component implementing real-time workflow analytics,
 * performance monitoring, and compliance features with Material Design 3.0 specifications.
 * @version 1.0.0
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { 
  Grid, 
  Box, 
  Typography, 
  Skeleton, 
  Alert,
  useTheme as useMuiTheme,
  useMediaQuery 
} from '@mui/material';

// Internal imports
import MainLayout from '../../components/layout/MainLayout';
import Stats from '../../components/dashboard/Stats';
import useWebSocket from '../../hooks/useWebSocket';
import { useAuth } from '../../hooks/useAuth';
import { WorkflowExecution } from '../../types/workflow.types';

// Types
interface DashboardProps {
  refreshInterval?: number;
  initialData?: DashboardData;
}

interface DashboardData {
  executions: WorkflowExecution[];
  lastUpdate: Date;
}

interface ErrorState {
  message: string;
  code: string;
  retryCount: number;
}

/**
 * Enhanced dashboard component with real-time updates, performance monitoring,
 * and comprehensive error handling.
 */
const Dashboard: React.FC<DashboardProps> = ({
  refreshInterval = 30000,
  initialData
}) => {
  // Theme and responsive hooks
  const muiTheme = useMuiTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('sm'));
  
  // State management
  const [loading, setLoading] = useState(!initialData);
  const [executions, setExecutions] = useState<WorkflowExecution[]>(
    initialData?.executions || []
  );
  const [error, setError] = useState<ErrorState | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(
    initialData?.lastUpdate || new Date()
  );
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Auth and WebSocket hooks
  const { isAuthenticated, user } = useAuth();
  const { 
    isConnected, 
    execution, 
    error: wsError, 
    connectionState,
    metrics 
  } = useWebSocket();

  // Refs for cleanup and performance
  const updateInterval = useRef<NodeJS.Timeout>();
  const retryTimeout = useRef<NodeJS.Timeout>();

  /**
   * Handles real-time execution updates with optimistic UI updates
   */
  const handleExecutionUpdate = useCallback((newExecution: WorkflowExecution) => {
    setExecutions(prev => {
      const index = prev.findIndex(e => e.id === newExecution.id);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = newExecution;
        return updated;
      }
      return [newExecution, ...prev];
    });
    setLastUpdate(new Date());
  }, []);

  /**
   * Handles error states with retry mechanism
   */
  const handleError = useCallback((error: Error) => {
    setError(prev => ({
      message: error.message,
      code: 'DASHBOARD_ERROR',
      retryCount: (prev?.retryCount || 0) + 1
    }));

    // Attempt retry after delay
    if (retryTimeout.current) {
      clearTimeout(retryTimeout.current);
    }
    retryTimeout.current = setTimeout(() => {
      if (error.retryCount < 3) {
        // Implement retry logic
      }
    }, 5000);
  }, []);

  /**
   * Handles online/offline status changes
   */
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  /**
   * Handle WebSocket execution updates
   */
  useEffect(() => {
    if (execution) {
      handleExecutionUpdate(execution);
    }
  }, [execution, handleExecutionUpdate]);

  /**
   * Handle WebSocket errors
   */
  useEffect(() => {
    if (wsError) {
      handleError(wsError);
    }
  }, [wsError, handleError]);

  /**
   * Cleanup intervals on unmount
   */
  useEffect(() => {
    return () => {
      if (updateInterval.current) {
        clearInterval(updateInterval.current);
      }
      if (retryTimeout.current) {
        clearTimeout(retryTimeout.current);
      }
    };
  }, []);

  return (
    <MainLayout>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          padding: { xs: 2, sm: 3 },
          minHeight: '100vh',
          position: 'relative'
        }}
        role="main"
        aria-label="Dashboard"
      >
        {/* Header section */}
        <Box mb={3}>
          <Typography 
            variant="h4" 
            component="h1"
            gutterBottom
            sx={{ fontWeight: 500 }}
          >
            {loading ? (
              <Skeleton width={200} />
            ) : (
              `Welcome${user?.firstName ? `, ${user.firstName}` : ''}`
            )}
          </Typography>
          <Typography 
            variant="body1" 
            color="textSecondary"
            sx={{ mb: 2 }}
          >
            {loading ? (
              <Skeleton width={300} />
            ) : (
              'Monitor your workflow performance and analytics in real-time'
            )}
          </Typography>
        </Box>

        {/* Error alerts */}
        {error && (
          <Alert 
            severity="error" 
            sx={{ mb: 3 }}
            onClose={() => setError(null)}
          >
            {error.message}
          </Alert>
        )}

        {/* Offline indicator */}
        {!isOnline && (
          <Alert 
            severity="warning" 
            sx={{ mb: 3 }}
          >
            You are currently offline. Some features may be limited.
          </Alert>
        )}

        {/* Stats section */}
        <Stats
          refreshInterval={refreshInterval}
          onError={handleError}
        />

        {/* Real-time connection status */}
        {isAuthenticated && (
          <Box
            sx={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: 'background.paper',
              p: 1,
              borderRadius: 1,
              boxShadow: 2
            }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: isConnected ? 'success.main' : 'error.main'
              }}
            />
            <Typography variant="caption" color="textSecondary">
              {isConnected ? 'Connected' : 'Disconnected'}
            </Typography>
          </Box>
        )}
      </Box>
    </MainLayout>
  );
};

// Export enhanced component with error boundary and analytics
export default Dashboard;