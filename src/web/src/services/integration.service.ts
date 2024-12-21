/**
 * @fileoverview Service class for managing external service integrations with comprehensive 
 * security, monitoring, and reliability features.
 * @version 1.0.0
 */

import { AxiosResponse } from 'axios'; // v1.6.0
import ApiService from './api';
import { API_ENDPOINTS } from '../constants/api';
import { 
  ServiceType, 
  AuthType, 
  ConnectionStatus,
  Integration,
  IntegrationConfig,
  integrationConfigSchema,
  integrationSchema
} from '../types/integration.types';

// Error messages
const INTEGRATION_ERROR = 'Error managing integration connection: ';
const REFRESH_ERROR = 'Error refreshing integration connection: ';

// Configuration constants
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT = 5000;
const RATE_LIMIT_WINDOW = 60000; // 1 minute

/**
 * Service class for managing external service integrations with comprehensive features
 */
export class IntegrationService {
  private readonly apiService: ApiService;
  private readonly maxRetries: number;
  private readonly requestTimeout: number;
  private readonly rateLimits: Map<ServiceType, number>;

  /**
   * Initializes integration service with API service instance and configuration
   * @param apiService - API service instance for HTTP communication
   * @param config - Optional integration configuration
   */
  constructor(
    apiService: ApiService,
    config?: Partial<IntegrationConfig>
  ) {
    this.apiService = apiService;
    this.maxRetries = config?.rateLimits?.burstLimit || MAX_RETRIES;
    this.requestTimeout = REQUEST_TIMEOUT;
    this.rateLimits = new Map([
      [ServiceType.EMAIL, 100],
      [ServiceType.CLOUD_STORAGE, 1000],
      [ServiceType.PROJECT_MANAGEMENT, 500],
      [ServiceType.COMMUNICATION, 200],
      [ServiceType.AI_SERVICE, 60]
    ]);
  }

  /**
   * Retrieves list of all integrations with status and health metrics
   * @returns Promise resolving to list of integrations
   * @throws Error if retrieval fails
   */
  public async listIntegrations(): Promise<Integration[]> {
    try {
      const response = await this.apiService.get<Integration[]>(
        API_ENDPOINTS.INTEGRATION.LIST,
        { timeout: this.requestTimeout }
      );

      // Validate response data
      const validatedIntegrations = response.map(integration => {
        const result = integrationSchema.safeParse(integration);
        if (!result.success) {
          console.error('Invalid integration data:', result.error);
          return null;
        }
        return result.data;
      }).filter((integration): integration is Integration => integration !== null);

      return validatedIntegrations;
    } catch (error) {
      console.error('Failed to list integrations:', error);
      throw new Error(`${INTEGRATION_ERROR}Failed to retrieve integrations list`);
    }
  }

  /**
   * Gets detailed status of specific integration including health metrics
   * @param serviceId - ID of the service to check
   * @returns Promise resolving to connection status
   * @throws Error if status check fails
   */
  public async getIntegrationStatus(serviceId: string): Promise<ConnectionStatus> {
    try {
      const endpoint = API_ENDPOINTS.INTEGRATION.STATUS.replace(':service', serviceId);
      const response = await this.apiService.get<{ status: ConnectionStatus }>(
        endpoint,
        { timeout: this.requestTimeout }
      );
      return response.status;
    } catch (error) {
      console.error('Failed to get integration status:', error);
      throw new Error(`${INTEGRATION_ERROR}Failed to retrieve integration status`);
    }
  }

  /**
   * Initiates secure connection to external service with validation
   * @param config - Integration configuration
   * @returns Promise resolving to connected integration object
   * @throws Error if connection fails
   */
  public async connectService(config: IntegrationConfig): Promise<Integration> {
    try {
      // Validate configuration
      const validationResult = integrationConfigSchema.safeParse(config);
      if (!validationResult.success) {
        throw new Error(`Invalid integration configuration: ${validationResult.error}`);
      }

      const endpoint = API_ENDPOINTS.INTEGRATION.CONNECT.replace(
        ':service',
        config.serviceType.toLowerCase()
      );

      const response = await this.apiService.post<Integration>(
        endpoint,
        config,
        {
          timeout: this.requestTimeout,
          headers: {
            'X-Rate-Limit': this.rateLimits.get(config.serviceType)?.toString()
          }
        }
      );

      // Validate response
      const validatedIntegration = integrationSchema.parse(response);
      return validatedIntegration;
    } catch (error) {
      console.error('Failed to connect service:', error);
      throw new Error(`${INTEGRATION_ERROR}Failed to establish connection`);
    }
  }

  /**
   * Safely disconnects from external service with cleanup
   * @param serviceId - ID of the service to disconnect
   * @returns Promise resolving to void on successful disconnect
   * @throws Error if disconnect fails
   */
  public async disconnectService(serviceId: string): Promise<void> {
    try {
      const endpoint = API_ENDPOINTS.INTEGRATION.DISCONNECT.replace(':service', serviceId);
      await this.apiService.delete<void>(
        endpoint,
        { timeout: this.requestTimeout }
      );
    } catch (error) {
      console.error('Failed to disconnect service:', error);
      throw new Error(`${INTEGRATION_ERROR}Failed to disconnect service`);
    }
  }

  /**
   * Refreshes OAuth tokens with comprehensive validation
   * @param serviceId - ID of the service to refresh
   * @returns Promise resolving to updated integration object
   * @throws Error if refresh fails
   */
  public async refreshConnection(serviceId: string): Promise<Integration> {
    try {
      const endpoint = API_ENDPOINTS.INTEGRATION.REFRESH.replace(':service', serviceId);
      const response = await this.apiService.post<Integration>(
        endpoint,
        {},
        { timeout: this.requestTimeout }
      );

      // Validate refreshed integration
      const validatedIntegration = integrationSchema.parse(response);
      return validatedIntegration;
    } catch (error) {
      console.error('Failed to refresh connection:', error);
      throw new Error(`${REFRESH_ERROR}Failed to refresh connection`);
    }
  }
}

// Export singleton instance
export default IntegrationService;