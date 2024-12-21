/**
 * @fileoverview Enhanced integration list component with real-time status monitoring,
 * health metrics tracking, and comprehensive error handling.
 * @version 1.0.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Grid,
  Typography,
  Button,
  Chip,
  CircularProgress,
  Tooltip,
  Skeleton
} from '@mui/material';
import {
  Refresh,
  Delete,
  Warning,
  CheckCircle,
  Error
} from '@mui/icons-material';
import CustomCard from '../../common/Card';
import useIntegration from '../../../hooks/useIntegration';
import { Integration, ConnectionStatus, ServiceType } from '../../../types/integration.types';

// Constants for status refresh and error handling
const STATUS_REFRESH_INTERVAL = 60000; // 1 minute
const ERROR_DISPLAY_DURATION = 5000;

/**
 * Props interface for the IntegrationList component
 */
interface IntegrationListProps {
  onSelect?: (integration: Integration) => void;
  onError?: (error: Error) => void;
  className?: string;
  showHealthMetrics?: boolean;
}

/**
 * Returns appropriate color for status chip based on connection status and health
 */
const getStatusColor = (status: ConnectionStatus, healthMetrics?: any) => {
  if (status === ConnectionStatus.ERROR || healthMetrics?.status === 'unhealthy') {
    return 'error';
  }
  if (status === ConnectionStatus.RATE_LIMITED || healthMetrics?.status === 'degraded') {
    return 'warning';
  }
  if (status === ConnectionStatus.CONNECTED && healthMetrics?.status === 'healthy') {
    return 'success';
  }
  return 'default';
};

/**
 * Enhanced integration list component with real-time monitoring and management
 */
export const IntegrationList: React.FC<IntegrationListProps> = ({
  onSelect,
  onError,
  className,
  showHealthMetrics = true
}) => {
  const {
    integrations,
    loading,
    error,
    disconnectService,
    refreshConnection,
    getHealthMetrics
  } = useIntegration();

  const [localError, setLocalError] = useState<string | null>(null);

  /**
   * Handles integration refresh with enhanced error handling
   */
  const handleRefresh = useCallback(async (integrationId: string) => {
    try {
      await refreshConnection(integrationId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to refresh connection';
      setLocalError(errorMessage);
      onError?.(error as Error);

      // Clear error after display duration
      setTimeout(() => setLocalError(null), ERROR_DISPLAY_DURATION);
    }
  }, [refreshConnection, onError]);

  /**
   * Handles integration disconnection with confirmation
   */
  const handleDisconnect = useCallback(async (integration: Integration) => {
    if (window.confirm(`Are you sure you want to disconnect ${integration.serviceType}?`)) {
      try {
        await disconnectService(integration.id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to disconnect service';
        setLocalError(errorMessage);
        onError?.(error as Error);
      }
    }
  }, [disconnectService, onError]);

  /**
   * Periodic status refresh for active integrations
   */
  useEffect(() => {
    const refreshTimer = setInterval(() => {
      integrations.forEach(integration => {
        if (integration.status === ConnectionStatus.CONNECTED) {
          handleRefresh(integration.id).catch(console.error);
        }
      });
    }, STATUS_REFRESH_INTERVAL);

    return () => clearInterval(refreshTimer);
  }, [integrations, handleRefresh]);

  /**
   * Renders status icon based on connection state and health
   */
  const renderStatusIcon = (integration: Integration) => {
    const healthMetrics = getHealthMetrics(integration.id);
    const status = integration.status;

    if (status === ConnectionStatus.ERROR || healthMetrics?.status === 'unhealthy') {
      return <Error color="error" />;
    }
    if (status === ConnectionStatus.RATE_LIMITED || healthMetrics?.status === 'degraded') {
      return <Warning color="warning" />;
    }
    if (status === ConnectionStatus.CONNECTED && healthMetrics?.status === 'healthy') {
      return <CheckCircle color="success" />;
    }
    return null;
  };

  /**
   * Renders loading skeleton during data fetch
   */
  if (loading) {
    return (
      <Grid container spacing={2} className={className}>
        {[1, 2, 3].map((key) => (
          <Grid item xs={12} key={key}>
            <Skeleton variant="rectangular" height={100} />
          </Grid>
        ))}
      </Grid>
    );
  }

  return (
    <Grid container spacing={2} className={className}>
      {localError && (
        <Grid item xs={12}>
          <Typography color="error" variant="body2">
            {localError}
          </Typography>
        </Grid>
      )}

      {integrations.map((integration) => (
        <Grid item xs={12} key={integration.id}>
          <CustomCard
            onClick={() => onSelect?.(integration)}
            ariaLabel={`${integration.serviceType} integration card`}
          >
            <Grid container alignItems="center" spacing={2}>
              <Grid item xs={6}>
                <Typography variant="h6">
                  {integration.serviceType}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Last used: {new Date(integration.lastUsed).toLocaleString()}
                </Typography>
              </Grid>

              <Grid item xs={3}>
                <Tooltip title={`Status: ${integration.status}`}>
                  <Chip
                    icon={renderStatusIcon(integration)}
                    label={integration.status}
                    color={getStatusColor(integration.status, getHealthMetrics(integration.id))}
                    size="small"
                  />
                </Tooltip>
              </Grid>

              {showHealthMetrics && (
                <Grid item xs={3}>
                  <Typography variant="body2" color="textSecondary">
                    Uptime: {getHealthMetrics(integration.id)?.uptime.toFixed(2)}%
                  </Typography>
                </Grid>
              )}

              <Grid item xs={12}>
                <Grid container justifyContent="flex-end" spacing={1}>
                  <Grid item>
                    <Button
                      startIcon={<Refresh />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRefresh(integration.id);
                      }}
                      disabled={integration.status === ConnectionStatus.RATE_LIMITED}
                      aria-label="Refresh connection"
                    >
                      Refresh
                    </Button>
                  </Grid>
                  <Grid item>
                    <Button
                      startIcon={<Delete />}
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDisconnect(integration);
                      }}
                      aria-label="Disconnect service"
                    >
                      Disconnect
                    </Button>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          </CustomCard>
        </Grid>
      ))}

      {integrations.length === 0 && !error && (
        <Grid item xs={12}>
          <Typography variant="body1" align="center" color="textSecondary">
            No integrations found. Connect a service to get started.
          </Typography>
        </Grid>
      )}
    </Grid>
  );
};

export default IntegrationList;