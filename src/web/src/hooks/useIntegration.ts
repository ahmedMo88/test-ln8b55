/**
 * @fileoverview Custom React hook for managing external service integrations
 * Provides centralized access to integration state and operations with enhanced
 * monitoring, security validation, and comprehensive error handling
 * @version 1.0.0
 */

import { useCallback, useEffect } from 'react'; // v18.2.0
import { useDispatch, useSelector } from 'react-redux'; // v8.0.5
import {
  selectIntegrations,
  selectSelectedIntegration,
  selectIntegrationLoading,
  selectIntegrationError,
  selectIntegrationHealth,
  fetchIntegrations,
  connectIntegration,
  disconnectIntegration,
  refreshIntegration,
  validateIntegration
} from '../../store/slices/integrationSlice';
import {
  Integration,
  IntegrationConfig,
  IntegrationHealth,
  IntegrationError
} from '../../types/integration.types';

// Constants for monitoring and health checks
const HEALTH_CHECK_INTERVAL = 300000; // 5 minutes
const TOKEN_REFRESH_THRESHOLD = 600000; // 10 minutes before expiry
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Custom hook for managing service integrations with enhanced monitoring and security
 * @returns Object containing integration state and management functions
 */
export const useIntegration = () => {
  const dispatch = useDispatch();

  // Select integration state from Redux store
  const integrations = useSelector(selectIntegrations);
  const selectedIntegration = useSelector(selectSelectedIntegration);
  const loading = useSelector(selectIntegrationLoading);
  const error = useSelector(selectIntegrationError);
  const health = useSelector(selectIntegrationHealth);

  /**
   * Fetches all integrations with health status
   * Implements retry logic with exponential backoff
   */
  const fetchIntegrationsWithRetry = useCallback(async () => {
    let attempts = 0;
    const attemptFetch = async (): Promise<void> => {
      try {
        await dispatch(fetchIntegrations()).unwrap();
      } catch (error) {
        if (attempts < MAX_RETRY_ATTEMPTS) {
          attempts++;
          const backoffDelay = Math.pow(2, attempts) * 1000;
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          return attemptFetch();
        }
        throw error;
      }
    };
    return attemptFetch();
  }, [dispatch]);

  /**
   * Connects new service with security validation
   * @param config Integration configuration
   */
  const connectService = useCallback(async (config: IntegrationConfig) => {
    try {
      await dispatch(connectIntegration(config)).unwrap();
      // Refresh integration list after successful connection
      await fetchIntegrationsWithRetry();
    } catch (error) {
      console.error('Failed to connect service:', error);
      throw error;
    }
  }, [dispatch, fetchIntegrationsWithRetry]);

  /**
   * Safely disconnects service with cleanup
   * @param serviceId ID of service to disconnect
   */
  const disconnectService = useCallback(async (serviceId: string) => {
    try {
      await dispatch(disconnectIntegration(serviceId)).unwrap();
      // Refresh integration list after successful disconnection
      await fetchIntegrationsWithRetry();
    } catch (error) {
      console.error('Failed to disconnect service:', error);
      throw error;
    }
  }, [dispatch, fetchIntegrationsWithRetry]);

  /**
   * Refreshes integration connection with token validation
   * @param serviceId ID of service to refresh
   */
  const refreshConnection = useCallback(async (serviceId: string) => {
    try {
      await dispatch(refreshIntegration(serviceId)).unwrap();
    } catch (error) {
      console.error('Failed to refresh connection:', error);
      throw error;
    }
  }, [dispatch]);

  /**
   * Validates integration health and connectivity
   * @param serviceId ID of service to validate
   */
  const validateConnection = useCallback(async (serviceId: string) => {
    try {
      await dispatch(validateIntegration(serviceId)).unwrap();
    } catch (error) {
      console.error('Failed to validate connection:', error);
      throw error;
    }
  }, [dispatch]);

  /**
   * Retrieves health metrics for specific integration
   * @param serviceId ID of service to check
   */
  const getHealthMetrics = useCallback((serviceId: string): IntegrationHealth => {
    return health[serviceId] || {
      status: 'unknown',
      lastChecked: new Date(),
      uptime: 0
    };
  }, [health]);

  // Set up periodic health checks
  useEffect(() => {
    const healthCheckTimer = setInterval(() => {
      integrations.forEach(integration => {
        validateConnection(integration.id).catch(console.error);
      });
    }, HEALTH_CHECK_INTERVAL);

    return () => clearInterval(healthCheckTimer);
  }, [integrations, validateConnection]);

  // Monitor token expiration and refresh as needed
  useEffect(() => {
    const tokenCheckTimer = setInterval(() => {
      integrations.forEach(integration => {
        if (integration.metadata?.tokens?.expiresAt) {
          const expiryTime = new Date(integration.metadata.tokens.expiresAt).getTime();
          const timeUntilExpiry = expiryTime - Date.now();
          
          if (timeUntilExpiry <= TOKEN_REFRESH_THRESHOLD) {
            refreshConnection(integration.id).catch(console.error);
          }
        }
      });
    }, TOKEN_REFRESH_THRESHOLD);

    return () => clearInterval(tokenCheckTimer);
  }, [integrations, refreshConnection]);

  // Initial fetch of integrations
  useEffect(() => {
    fetchIntegrationsWithRetry().catch(console.error);
  }, [fetchIntegrationsWithRetry]);

  return {
    integrations,
    selectedIntegration,
    loading,
    error,
    health,
    fetchIntegrations: fetchIntegrationsWithRetry,
    connectService,
    disconnectService,
    refreshConnection,
    validateConnection,
    getHealthMetrics
  };
};

export default useIntegration;