/**
 * @fileoverview Workflow service implementation for managing workflow operations
 * with enhanced reliability features including caching, circuit breaking, and retry logic.
 * @version 1.0.0
 */

import { AxiosResponse } from 'axios'; // v1.6.0
import CircuitBreaker from 'opossum'; // v6.0.0
import { Cache } from 'lru-cache'; // v7.0.0
import { WebSocket } from 'ws'; // v8.0.0

// Internal imports
import { 
  Workflow, 
  WorkflowExecution, 
  WorkflowStatus, 
  WorkflowValidationError,
  isWorkflow 
} from '../types/workflow.types';
import { ApiService } from './api';
import { API_ENDPOINTS, formatEndpoint } from '../constants/api';

// Constants for configuration
const CACHE_MAX_SIZE = 100;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CIRCUIT_BREAKER_OPTIONS = {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
};
const WS_RECONNECT_DELAY = 1000;
const MAX_RETRIES = 3;

/**
 * Interface for workflow service options
 */
interface WorkflowServiceOptions {
  baseUrl?: string;
  maxRetries?: number;
  cacheSize?: number;
  cacheTTL?: number;
}

/**
 * Interface for workflow list filters
 */
interface WorkflowFilters {
  status?: WorkflowStatus;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Service class for managing workflow operations with enhanced reliability features
 */
export class WorkflowService {
  private readonly apiService: ApiService;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly workflowCache: Cache<string, Workflow>;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private wsConnection: WebSocket | null = null;
  private wsReconnectTimeout: NodeJS.Timeout | null = null;

  /**
   * Initializes the workflow service with dependencies and configuration
   */
  constructor(apiService: ApiService, options: WorkflowServiceOptions = {}) {
    this.apiService = apiService;
    this.baseUrl = options.baseUrl || '';
    this.maxRetries = options.maxRetries || MAX_RETRIES;

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker(this.makeRequest.bind(this), CIRCUIT_BREAKER_OPTIONS);
    this.setupCircuitBreakerEvents();

    // Initialize cache
    this.workflowCache = new Cache({
      max: options.cacheSize || CACHE_MAX_SIZE,
      ttl: options.cacheTTL || CACHE_TTL,
      updateAgeOnGet: true
    });
  }

  /**
   * Retrieves a list of workflows with filtering and caching
   */
  public async getWorkflows(filters: WorkflowFilters = {}): Promise<Workflow[]> {
    const cacheKey = this.generateCacheKey('workflows', filters);
    const cachedData = this.workflowCache.get(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) {
        queryParams.append(key, value.toString());
      }
    });

    const url = `${API_ENDPOINTS.WORKFLOW.LIST}?${queryParams.toString()}`;
    const workflows = await this.executeWithRetry<Workflow[]>(() => 
      this.circuitBreaker.fire(() => this.apiService.get(url))
    );

    this.workflowCache.set(cacheKey, workflows);
    return workflows;
  }

  /**
   * Creates a new workflow
   */
  public async createWorkflow(workflow: Partial<Workflow>): Promise<Workflow> {
    const response = await this.executeWithRetry<Workflow>(() =>
      this.circuitBreaker.fire(() => 
        this.apiService.post(API_ENDPOINTS.WORKFLOW.CREATE, workflow)
      )
    );

    this.invalidateWorkflowCache();
    return response;
  }

  /**
   * Updates an existing workflow
   */
  public async updateWorkflow(id: string, workflow: Partial<Workflow>): Promise<Workflow> {
    const url = formatEndpoint(API_ENDPOINTS.WORKFLOW.UPDATE, { id });
    const response = await this.executeWithRetry<Workflow>(() =>
      this.circuitBreaker.fire(() => 
        this.apiService.put(url, workflow)
      )
    );

    this.workflowCache.delete(this.generateCacheKey('workflow', { id }));
    this.invalidateWorkflowCache();
    return response;
  }

  /**
   * Deploys a workflow to production
   */
  public async deployWorkflow(id: string): Promise<WorkflowExecution> {
    const url = formatEndpoint(API_ENDPOINTS.WORKFLOW.DEPLOY, { id });
    return this.executeWithRetry<WorkflowExecution>(() =>
      this.circuitBreaker.fire(() => 
        this.apiService.post(url)
      )
    );
  }

  /**
   * Validates a workflow before deployment
   */
  public async validateWorkflow(id: string): Promise<WorkflowValidationError[]> {
    const url = formatEndpoint(API_ENDPOINTS.WORKFLOW.VALIDATE, { id });
    return this.executeWithRetry<WorkflowValidationError[]>(() =>
      this.circuitBreaker.fire(() => 
        this.apiService.post(url)
      )
    );
  }

  /**
   * Subscribes to real-time workflow execution updates
   */
  public subscribeToExecutionUpdates(
    workflowId: string, 
    onUpdate: (execution: WorkflowExecution) => void,
    onError?: (error: Error) => void
  ): () => void {
    this.setupWebSocket(workflowId, onUpdate, onError);

    return () => {
      this.cleanupWebSocket();
    };
  }

  /**
   * Helper method to execute requests with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>, 
    retries: number = this.maxRetries
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retries > 0 && this.isRetryableError(error)) {
        await this.delay(Math.pow(2, this.maxRetries - retries) * 1000);
        return this.executeWithRetry(operation, retries - 1);
      }
      throw error;
    }
  }

  /**
   * Sets up circuit breaker event handlers
   */
  private setupCircuitBreakerEvents(): void {
    this.circuitBreaker.on('open', () => {
      console.warn('Circuit breaker opened - workflow service is unavailable');
    });

    this.circuitBreaker.on('halfOpen', () => {
      console.info('Circuit breaker is half open - testing workflow service');
    });

    this.circuitBreaker.on('close', () => {
      console.info('Circuit breaker closed - workflow service has recovered');
    });
  }

  /**
   * Sets up WebSocket connection for real-time updates
   */
  private setupWebSocket(
    workflowId: string,
    onUpdate: (execution: WorkflowExecution) => void,
    onError?: (error: Error) => void
  ): void {
    const wsUrl = `${this.baseUrl}/ws/workflows/${workflowId}/executions`;
    
    this.cleanupWebSocket();
    this.wsConnection = new WebSocket(wsUrl);

    this.wsConnection.onmessage = (event) => {
      try {
        const execution = JSON.parse(event.data.toString());
        onUpdate(execution);
      } catch (error) {
        onError?.(new Error('Failed to parse execution update'));
      }
    };

    this.wsConnection.onerror = (error) => {
      onError?.(new Error('WebSocket connection error'));
      this.scheduleReconnect(workflowId, onUpdate, onError);
    };

    this.wsConnection.onclose = () => {
      this.scheduleReconnect(workflowId, onUpdate, onError);
    };
  }

  /**
   * Schedules WebSocket reconnection
   */
  private scheduleReconnect(
    workflowId: string,
    onUpdate: (execution: WorkflowExecution) => void,
    onError?: (error: Error) => void
  ): void {
    if (this.wsReconnectTimeout === null) {
      this.wsReconnectTimeout = setTimeout(() => {
        this.setupWebSocket(workflowId, onUpdate, onError);
        this.wsReconnectTimeout = null;
      }, WS_RECONNECT_DELAY);
    }
  }

  /**
   * Cleans up WebSocket connection and reconnection timeout
   */
  private cleanupWebSocket(): void {
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }

    if (this.wsReconnectTimeout) {
      clearTimeout(this.wsReconnectTimeout);
      this.wsReconnectTimeout = null;
    }
  }

  /**
   * Generates cache key for workflow data
   */
  private generateCacheKey(prefix: string, params: Record<string, any>): string {
    return `${prefix}:${JSON.stringify(params)}`;
  }

  /**
   * Invalidates workflow cache
   */
  private invalidateWorkflowCache(): void {
    this.workflowCache.clear();
  }

  /**
   * Determines if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    return (
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.response?.status === 429 ||
      error.response?.status >= 500
    );
  }

  /**
   * Utility method for delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Makes HTTP request through circuit breaker
   */
  private async makeRequest<T>(config: any): Promise<T> {
    return this.apiService.get(config.url, config);
  }
}

export default WorkflowService;