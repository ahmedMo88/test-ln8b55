/**
 * @fileoverview Enhanced dashboard activity component displaying real-time workflow execution
 * activities with WebSocket integration, virtualized scrolling, and comprehensive error handling.
 * @version 1.0.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { 
  List, 
  ListItem, 
  ListItemText, 
  ListItemIcon, 
  Tooltip, 
  Skeleton,
  Typography,
  IconButton
} from '@mui/material'; // v5.14.0
import { 
  CheckCircle, 
  Error, 
  Info, 
  Schedule, 
  Warning,
  Refresh
} from '@mui/icons-material'; // v5.14.0
import { FixedSizeList as VirtualList } from 'react-window'; // v1.8.9
import { formatDistanceToNow } from 'date-fns'; // v2.30.0

// Internal imports
import { Loading } from '../../common/Loading';
import { Card } from '../../common/Card';
import { useWorkflow } from '../../../hooks/useWorkflow';
import { getPalette } from '../../../theme/palette';
import { useTheme } from '@mui/material/styles';

// Constants
const ITEM_SIZE = 72; // Height of each activity item in pixels
const DEFAULT_LIMIT = 50;
const RETRY_DELAY = 3000;

/**
 * Props interface for the Activity component
 */
interface ActivityProps {
  limit?: number;
  className?: string;
  onError?: (error: Error) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  batchInterval?: number;
}

/**
 * Enhanced interface for individual activity items
 */
interface ActivityItem {
  id: string;
  type: 'workflow' | 'system' | 'security';
  message: string;
  timestamp: Date;
  status: 'success' | 'error' | 'info' | 'pending' | 'warning';
  metadata?: Record<string, unknown>;
  retryCount?: number;
  errorDetails?: string;
}

/**
 * Enhanced activity component for displaying real-time workflow activities
 * with comprehensive error handling and performance optimizations.
 */
export const Activity: React.FC<ActivityProps> = React.memo(({
  limit = DEFAULT_LIMIT,
  className,
  onError,
  autoReconnect = true,
  reconnectInterval = RETRY_DELAY,
  batchInterval = 1000
}) => {
  // State management
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Theme and styling
  const theme = useTheme();
  const palette = getPalette(theme.palette.mode);

  // WebSocket integration
  const { 
    wsConnected, 
    execution, 
    wsError, 
    connectionState 
  } = useWorkflow(undefined, {
    autoReconnect,
    reconnectInterval,
    batchInterval
  });

  /**
   * Memoized status icon mapping with accessibility support
   */
  const getStatusIcon = useCallback((status: string) => {
    const iconProps = {
      fontSize: 'small',
      sx: { mr: 1 }
    };

    const icons = {
      success: <CheckCircle {...iconProps} sx={{ color: palette.success.main }} />,
      error: <Error {...iconProps} sx={{ color: palette.error.main }} />,
      info: <Info {...iconProps} sx={{ color: palette.info.main }} />,
      pending: <Schedule {...iconProps} sx={{ color: palette.warning.main }} />,
      warning: <Warning {...iconProps} sx={{ color: palette.warning.main }} />
    };

    return (
      <Tooltip title={`Status: ${status}`} arrow>
        <span role="img" aria-label={`Status: ${status}`}>
          {icons[status as keyof typeof icons]}
        </span>
      </Tooltip>
    );
  }, [palette]);

  /**
   * Handle new activity updates with batching
   */
  useEffect(() => {
    if (execution) {
      setActivities(prev => {
        const newActivity: ActivityItem = {
          id: execution.id,
          type: 'workflow',
          message: `Workflow ${execution.status}: ${execution.workflowId}`,
          timestamp: new Date(execution.startTime),
          status: execution.status === 'completed' ? 'success' : 
                 execution.status === 'failed' ? 'error' : 
                 execution.status === 'running' ? 'pending' : 'info',
          metadata: {
            workflowId: execution.workflowId,
            metrics: execution.metrics
          },
          errorDetails: execution.error?.message
        };

        return [newActivity, ...prev].slice(0, limit);
      });
    }
  }, [execution, limit]);

  /**
   * Handle WebSocket errors with retry logic
   */
  useEffect(() => {
    if (wsError) {
      const error = new Error(`WebSocket error: ${wsError.message}`);
      setError(error);
      onError?.(error);

      if (autoReconnect && retryCount < 3) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
        }, reconnectInterval * Math.pow(2, retryCount));
      }
    }
  }, [wsError, autoReconnect, reconnectInterval, retryCount, onError]);

  /**
   * Render activity item with accessibility support
   */
  const ActivityItemComponent = useCallback(({ index, style }: any) => {
    const activity = activities[index];
    if (!activity) return null;

    return (
      <ListItem
        style={style}
        sx={{
          borderBottom: `1px solid ${palette.divider}`,
          '&:hover': {
            backgroundColor: palette.action?.hover
          }
        }}
        role="listitem"
        tabIndex={0}
      >
        <ListItemIcon>
          {getStatusIcon(activity.status)}
        </ListItemIcon>
        <ListItemText
          primary={activity.message}
          secondary={
            <Typography variant="caption" color="textSecondary">
              {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
              {activity.errorDetails && (
                <Tooltip title={activity.errorDetails} arrow>
                  <Typography 
                    component="span" 
                    color="error" 
                    sx={{ ml: 1 }}
                  >
                    (Error Details)
                  </Typography>
                </Tooltip>
              )}
            </Typography>
          }
        />
      </ListItem>
    );
  }, [activities, palette, getStatusIcon]);

  /**
   * Handle manual refresh
   */
  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setRetryCount(0);
    // Trigger WebSocket reconnection
  }, []);

  /**
   * Render loading state
   */
  if (isLoading && !activities.length) {
    return (
      <Card className={className}>
        <List sx={{ p: 0 }}>
          {[...Array(3)].map((_, i) => (
            <ListItem key={i}>
              <Skeleton variant="circular" width={24} height={24} sx={{ mr: 2 }} />
              <ListItem>
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="20%" />
              </ListItem>
            </ListItem>
          ))}
        </List>
      </Card>
    );
  }

  /**
   * Render error state with retry option
   */
  if (error && !wsConnected) {
    return (
      <Card className={className}>
        <Typography color="error" align="center" sx={{ p: 2 }}>
          {error.message}
        </Typography>
        <IconButton
          onClick={handleRefresh}
          aria-label="Retry connection"
          sx={{ display: 'block', mx: 'auto', mb: 2 }}
        >
          <Refresh />
        </IconButton>
      </Card>
    );
  }

  /**
   * Render main activity list with virtualization
   */
  return (
    <Card className={className}>
      <VirtualList
        height={400}
        width="100%"
        itemCount={activities.length}
        itemSize={ITEM_SIZE}
        overscanCount={5}
      >
        {ActivityItemComponent}
      </VirtualList>
      {!activities.length && (
        <Typography 
          color="textSecondary" 
          align="center" 
          sx={{ p: 2 }}
        >
          No recent activity
        </Typography>
      )}
    </Card>
  );
});

Activity.displayName = 'Activity';

export default Activity;