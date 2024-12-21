/**
 * @fileoverview Main integrations page component providing a centralized interface
 * for managing external service connections with enhanced security, accessibility,
 * and monitoring features.
 * @version 1.0.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Container,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Skeleton,
  Box
} from '@mui/material';
import { Add, Refresh } from '@mui/icons-material';
import { useAnalytics } from '@segment/analytics-next';
import { ErrorBoundary } from 'react-error-boundary';

// Internal imports
import IntegrationList from '../../components/integration/List';
import IntegrationForm from '../../components/integration/Form';
import useIntegration from '../../hooks/useIntegration';
import { Integration, IntegrationConfig } from '../../types/integration.types';

// Styled components using Material Design 3.0 specifications
const styles = {
  container: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
    position: 'relative'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '16px'
  },
  content: {
    position: 'relative',
    minHeight: '400px',
    backgroundColor: 'background.paper',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
    zIndex: 1
  }
} as const;

/**
 * Main integrations page component with error boundary and analytics tracking
 */
export const IntegrationsPage: React.FC = () => {
  // Integration state management
  const {
    integrations,
    loading,
    error,
    connectService,
    refreshConnection,
    getHealthMetrics
  } = useIntegration();

  // Local state
  const [showForm, setShowForm] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Analytics tracking
  const { track } = useAnalytics();

  /**
   * Handles adding new integration with validation
   */
  const handleAddIntegration = useCallback(() => {
    track('Integration Add Clicked', {
      timestamp: new Date().toISOString()
    });
    setSelectedIntegration(null);
    setShowForm(true);
  }, [track]);

  /**
   * Handles integration form submission with error handling
   */
  const handleFormSubmit = useCallback(async (config: IntegrationConfig) => {
    try {
      await connectService(config);
      track('Integration Connected', {
        serviceType: config.serviceType,
        timestamp: new Date().toISOString()
      });
      setShowForm(false);
      setLocalError(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect integration';
      setLocalError(errorMessage);
      track('Integration Connection Failed', {
        serviceType: config.serviceType,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
    }
  }, [connectService, track]);

  /**
   * Handles integration selection for editing
   */
  const handleIntegrationSelect = useCallback((integration: Integration) => {
    setSelectedIntegration(integration);
    setShowForm(true);
    track('Integration Selected', {
      integrationId: integration.id,
      serviceType: integration.serviceType,
      timestamp: new Date().toISOString()
    });
  }, [track]);

  /**
   * Error boundary fallback component
   */
  const ErrorFallback = ({ error, resetErrorBoundary }: any) => (
    <Alert 
      severity="error" 
      action={
        <Button color="inherit" size="small" onClick={resetErrorBoundary}>
          Retry
        </Button>
      }
    >
      {error.message}
    </Alert>
  );

  return (
    <Container sx={styles.container}>
      <Box sx={styles.header}>
        <Typography variant="h4" component="h1">
          Integrations
        </Typography>
        <Box display="flex" gap={2}>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleAddIntegration}
            disabled={loading}
          >
            Add Integration
          </Button>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={() => refreshConnection}
            disabled={loading}
          >
            Refresh All
          </Button>
        </Box>
      </Box>

      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Box sx={styles.content}>
          {loading && (
            <Box sx={styles.loadingOverlay}>
              <CircularProgress />
            </Box>
          )}

          {localError && (
            <Alert 
              severity="error" 
              onClose={() => setLocalError(null)}
              sx={{ marginBottom: 2 }}
            >
              {localError}
            </Alert>
          )}

          {showForm ? (
            <IntegrationForm
              initialValues={selectedIntegration ? {
                serviceType: selectedIntegration.serviceType,
                authType: selectedIntegration.authType,
                settings: selectedIntegration.metadata.settings || {},
                rateLimits: selectedIntegration.metadata.rateLimits
              } : undefined}
              onSubmit={handleFormSubmit}
              onCancel={() => setShowForm(false)}
              isLoading={loading}
              error={error ? new Error(error) : undefined}
            />
          ) : (
            <IntegrationList
              onSelect={handleIntegrationSelect}
              onRefresh={refreshConnection}
              showHealthMetrics={true}
            />
          )}
        </Box>
      </ErrorBoundary>
    </Container>
  );
};

export default IntegrationsPage;