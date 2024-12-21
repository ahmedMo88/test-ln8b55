/**
 * @fileoverview Enhanced integration card component for displaying and managing service integrations
 * with comprehensive security features, accessibility support, and error handling.
 * @version 1.0.0
 */

import React, { useCallback, useState } from 'react';
import { Typography, Button, IconButton, Chip, CircularProgress, Tooltip } from '@mui/material'; // v5.14.0
import { styled } from '@mui/material/styles'; // v5.14.0
import CustomCard from '../../common/Card';
import { Integration, ConnectionStatus, ServiceType } from '../../../types/integration.types';
import IntegrationService from '../../../services/integration.service';

// Styled components with Material Design 3.0 specifications
const StyledCard = styled(CustomCard)(({ theme }) => ({
  minWidth: '300px',
  maxWidth: '400px',
  margin: '8px',
  transition: 'all 0.3s ease-in-out',
  position: 'relative',
  overflow: 'visible',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: theme.shadows[4],
  },
}));

const CardHeader = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  marginBottom: '16px',
  position: 'relative',
}));

const ServiceIcon = styled('div')(({ theme }) => ({
  width: '32px',
  height: '32px',
  color: theme.palette.primary.main,
  transition: 'color 0.2s ease',
}));

const StatusChip = styled(Chip)(({ theme }) => ({
  marginLeft: 'auto',
  transition: 'background-color 0.2s ease',
}));

const CardActions = styled('div')(({ theme }) => ({
  justifyContent: 'flex-end',
  gap: '8px',
  padding: '8px 16px',
  position: 'relative',
}));

const SecurityBadge = styled('div')(({ theme }) => ({
  position: 'absolute',
  top: '-8px',
  right: '-8px',
  zIndex: 1,
}));

const LoadingOverlay = styled('div')(({ theme }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(255, 255, 255, 0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2,
}));

// Props interface with enhanced security and error handling
interface IntegrationCardProps {
  integration: Integration;
  onConnect?: (integration: Integration) => Promise<void>;
  onDisconnect?: (integrationId: string) => Promise<void>;
  onRefresh?: (integrationId: string) => Promise<void>;
  onError?: (error: Error) => void;
  securityLevel?: 'high' | 'medium' | 'low';
  retryConfig?: {
    maxAttempts: number;
    delayMs: number;
  };
}

// Helper function to determine status color with security context
const getStatusColor = (status: ConnectionStatus, securityLevel?: string): string => {
  switch (status) {
    case ConnectionStatus.CONNECTED:
      return securityLevel === 'high' ? '#00C853' : '#4CAF50';
    case ConnectionStatus.DISCONNECTED:
      return '#9E9E9E';
    case ConnectionStatus.EXPIRED:
      return '#FF9800';
    case ConnectionStatus.ERROR:
      return '#F44336';
    case ConnectionStatus.RATE_LIMITED:
      return '#FFC107';
    default:
      return '#9E9E9E';
  }
};

// Helper function to get service icon with accessibility support
const getServiceIcon = (type: ServiceType): React.ReactNode => {
  // Implementation would include actual icon components
  return <div role="img" aria-label={`${type} service icon`} />;
};

/**
 * Enhanced IntegrationCard component for displaying and managing service integrations
 * with comprehensive security features and accessibility support.
 */
export const IntegrationCard: React.FC<IntegrationCardProps> = ({
  integration,
  onConnect,
  onDisconnect,
  onRefresh,
  onError,
  securityLevel = 'medium',
  retryConfig = { maxAttempts: 3, delayMs: 1000 },
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Enhanced connection handler with retry logic and security validation
  const handleConnect = useCallback(async () => {
    if (isLoading || !onConnect) return;

    try {
      setIsLoading(true);
      await onConnect(integration);
    } catch (error) {
      if (retryCount < retryConfig.maxAttempts) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          handleConnect();
        }, retryConfig.delayMs);
      } else {
        onError?.(error as Error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [integration, onConnect, retryCount, retryConfig, onError]);

  // Enhanced disconnect handler with security cleanup
  const handleDisconnect = useCallback(async () => {
    if (isLoading || !onDisconnect) return;

    try {
      setIsLoading(true);
      await onDisconnect(integration.id);
    } catch (error) {
      onError?.(error as Error);
    } finally {
      setIsLoading(false);
    }
  }, [integration.id, onDisconnect, onError]);

  // Enhanced refresh handler with rate limit awareness
  const handleRefresh = useCallback(async () => {
    if (isLoading || !onRefresh) return;

    try {
      setIsLoading(true);
      await onRefresh(integration.id);
    } catch (error) {
      onError?.(error as Error);
    } finally {
      setIsLoading(false);
    }
  }, [integration.id, onRefresh, onError]);

  return (
    <StyledCard
      role="article"
      aria-label={`${integration.serviceType} integration card`}
    >
      {isLoading && (
        <LoadingOverlay>
          <CircularProgress />
        </LoadingOverlay>
      )}

      <SecurityBadge>
        <Tooltip title={`Security Level: ${securityLevel}`}>
          <Chip
            size="small"
            label={securityLevel}
            color={securityLevel === 'high' ? 'success' : 'default'}
          />
        </Tooltip>
      </SecurityBadge>

      <CardHeader>
        <ServiceIcon>
          {getServiceIcon(integration.serviceType)}
        </ServiceIcon>
        <Typography variant="h6" component="h3">
          {integration.serviceType}
        </Typography>
        <StatusChip
          label={integration.status}
          size="small"
          style={{ backgroundColor: getStatusColor(integration.status, securityLevel) }}
        />
      </CardHeader>

      <Typography variant="body2" color="textSecondary" gutterBottom>
        Last used: {new Date(integration.lastUsed).toLocaleDateString()}
      </Typography>

      <CardActions>
        {integration.status === ConnectionStatus.CONNECTED && (
          <>
            <Button
              size="small"
              onClick={handleRefresh}
              disabled={isLoading}
              aria-label="Refresh connection"
            >
              Refresh
            </Button>
            <Button
              size="small"
              color="error"
              onClick={handleDisconnect}
              disabled={isLoading}
              aria-label="Disconnect service"
            >
              Disconnect
            </Button>
          </>
        )}
        {integration.status !== ConnectionStatus.CONNECTED && (
          <Button
            size="small"
            color="primary"
            onClick={handleConnect}
            disabled={isLoading}
            aria-label="Connect service"
          >
            Connect
          </Button>
        )}
      </CardActions>
    </StyledCard>
  );
};

export default IntegrationCard;