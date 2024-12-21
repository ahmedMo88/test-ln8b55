/**
 * @fileoverview Core API service module implementing HTTP client with interceptors
 * for authentication, error handling, request/response processing, circuit breaking,
 * and comprehensive retry mechanisms.
 * @version 1.0.0
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'; // v1.6.0
import axiosRetry from 'axios-retry'; // v3.8.0
import { API_ENDPOINTS, API_CONFIG, BASE_URL } from '../constants/api';
import { getToken, getRefreshToken } from '../utils/auth';
import { AuthError } from '../types/auth.types';

// Error messages
const REFRESH_TOKEN_ERROR = 'Error refreshing token';
const NETWORK_ERROR = 'Network Error';
const CIRCUIT_BREAKER_ERROR = 'Service temporarily unavailable';

// Circuit breaker configuration
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_TIME = 30000; // 30 seconds

// Cache configuration
const CACHE_TTL = 300000; // 5 minutes

/**
 * Request cache interface for storing responses
 */
interface CacheEntry {
  data: any;
  timestamp: number;
}

/**
 * Circuit breaker state tracking
 */
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

/**
 * Core API service class implementing comprehensive HTTP client functionality
 */
class ApiService {
  private client: AxiosInstance;
  private refreshTokenPromise: Promise<string> | null = null;
  private cache: Map<string, CacheEntry> = new Map();
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    isOpen: false
  };

  constructor() {
    // Initialize axios instance with base configuration
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: API_CONFIG.TIMEOUT,
      headers: API_CONFIG.HEADERS
    });

    // Configure retry mechanism
    axiosRetry(this.client, {
      retries: API_CONFIG.RETRY_ATTEMPTS,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error: AxiosError) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429;
      }
    });

    this.setupInterceptors();
  }

  /**
   * Configures request and response interceptors for the HTTP client
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      async (config) => {
        // Check circuit breaker
        if (this.isCircuitBreakerOpen()) {
          throw new Error(CIRCUIT_BREAKER_ERROR);
        }

        // Add authentication token
        const token = getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Check cache for GET requests
        if (config.method === 'get' && this.cache.has(config.url!)) {
          const cached = this.cache.get(config.url!);
          if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return Promise.reject({
              config,
              response: { data: cached.data, status: 304 }
            });
          }
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        // Reset circuit breaker on successful response
        this.resetCircuitBreaker();

        // Cache GET responses
        if (response.config.method === 'get' && response.status === 200) {
          this.cache.set(response.config.url!, {
            data: response.data,
            timestamp: Date.now()
          });
        }

        return response;
      },
      async (error: AxiosError) => {
        // Update circuit breaker on failure
        this.recordFailure();

        // Handle 401 Unauthorized errors
        if (error.response?.status === 401) {
          return this.handle401Error(error);
        }

        // Handle rate limiting
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          return this.handleRateLimiting(error.config!, parseInt(retryAfter));
        }

        // Handle network errors
        if (!error.response) {
          return Promise.reject({
            code: 'NETWORK_ERROR',
            message: NETWORK_ERROR
          });
        }

        return Promise.reject(this.formatError(error));
      }
    );
  }

  /**
   * Handles 401 Unauthorized errors with token refresh
   */
  private async handle401Error(error: AxiosError): Promise<AxiosResponse> {
    if (!this.refreshTokenPromise) {
      this.refreshTokenPromise = this.refreshToken();
    }

    try {
      const newToken = await this.refreshTokenPromise;
      error.config!.headers.Authorization = `Bearer ${newToken}`;
      this.refreshTokenPromise = null;
      return this.client(error.config!);
    } catch (refreshError) {
      this.refreshTokenPromise = null;
      throw refreshError;
    }
  }

  /**
   * Refreshes the authentication token
   */
  private async refreshToken(): Promise<string> {
    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        throw new Error(REFRESH_TOKEN_ERROR);
      }

      const response = await this.client.post(API_ENDPOINTS.AUTH.REFRESH_TOKEN, {
        refreshToken
      });

      return response.data.accessToken;
    } catch (error) {
      throw new Error(REFRESH_TOKEN_ERROR);
    }
  }

  /**
   * Handles rate limiting with exponential backoff
   */
  private async handleRateLimiting(
    config: AxiosRequestConfig,
    retryAfter: number
  ): Promise<AxiosResponse> {
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    return this.client(config);
  }

  /**
   * Formats error response for consistent error handling
   */
  private formatError(error: AxiosError): AuthError {
    return {
      message: error.response?.data?.message || error.message,
      code: error.response?.status as AuthError['code'],
      field: error.response?.data?.field,
      action: error.response?.data?.action,
      metadata: error.response?.data?.metadata
    };
  }

  /**
   * Circuit breaker implementation
   */
  private isCircuitBreakerOpen(): boolean {
    if (!this.circuitBreaker.isOpen) {
      return false;
    }

    if (Date.now() - this.circuitBreaker.lastFailure > CIRCUIT_BREAKER_RESET_TIME) {
      this.resetCircuitBreaker();
      return false;
    }

    return true;
  }

  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();

    if (this.circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBreaker.isOpen = true;
    }
  }

  private resetCircuitBreaker(): void {
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.isOpen = false;
  }

  /**
   * Public API methods
   */
  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  public async post<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  public async put<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;