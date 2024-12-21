/**
 * @fileoverview Centralized API endpoint constants and configuration for frontend services.
 * Implements versioned endpoints and comprehensive service configurations.
 * @version 1.0.0
 */

// Base API configuration
export const API_VERSION = '/api/v1';
export const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

/**
 * Comprehensive API endpoint constants for all microservices
 */
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: `${API_VERSION}/auth/login`,
    REGISTER: `${API_VERSION}/auth/register`,
    LOGOUT: `${API_VERSION}/auth/logout`,
    REFRESH_TOKEN: `${API_VERSION}/auth/refresh`,
    CURRENT_USER: `${API_VERSION}/auth/user`,
    MFA_SETUP: `${API_VERSION}/auth/mfa/setup`,
    MFA_VERIFY: `${API_VERSION}/auth/mfa/verify`,
    PASSWORD_RESET: `${API_VERSION}/auth/password/reset`,
    PASSWORD_CHANGE: `${API_VERSION}/auth/password/change`,
  },

  WORKFLOW: {
    LIST: `${API_VERSION}/workflows`,
    CREATE: `${API_VERSION}/workflows`,
    GET: `${API_VERSION}/workflows/:id`,
    UPDATE: `${API_VERSION}/workflows/:id`,
    DELETE: `${API_VERSION}/workflows/:id`,
    DEPLOY: `${API_VERSION}/workflows/:id/deploy`,
    VALIDATE: `${API_VERSION}/workflows/:id/validate`,
    EXPORT: `${API_VERSION}/workflows/:id/export`,
    IMPORT: `${API_VERSION}/workflows/import`,
    VERSIONS: `${API_VERSION}/workflows/:id/versions`,
    ROLLBACK: `${API_VERSION}/workflows/:id/rollback`,
  },

  INTEGRATION: {
    LIST: `${API_VERSION}/integrations`,
    CONNECT: `${API_VERSION}/integrations/:service/connect`,
    DISCONNECT: `${API_VERSION}/integrations/:service/disconnect`,
    STATUS: `${API_VERSION}/integrations/:service/status`,
    REFRESH: `${API_VERSION}/integrations/:service/refresh`,
    VALIDATE: `${API_VERSION}/integrations/:service/validate`,
    PERMISSIONS: `${API_VERSION}/integrations/:service/permissions`,
    TEST: `${API_VERSION}/integrations/:service/test`,
  },

  EXECUTION: {
    LIST: `${API_VERSION}/executions`,
    GET: `${API_VERSION}/executions/:id`,
    STATUS: `${API_VERSION}/executions/:id/status`,
    LOGS: `${API_VERSION}/executions/:id/logs`,
    CANCEL: `${API_VERSION}/executions/:id/cancel`,
    RETRY: `${API_VERSION}/executions/:id/retry`,
    METRICS: `${API_VERSION}/executions/:id/metrics`,
    TIMELINE: `${API_VERSION}/executions/:id/timeline`,
  },
} as const;

/**
 * API configuration settings including timeout, retry, headers, and rate limits
 */
export const API_CONFIG = {
  // Request timeout in milliseconds
  TIMEOUT: 30000,

  // Retry configuration
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,

  // Default headers for API requests
  HEADERS: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-API-Version': '1.0',
    'X-Client-Version': process.env.REACT_APP_VERSION,
  },

  // Standard HTTP error codes
  ERROR_CODES: {
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    RATE_LIMITED: 429,
    SERVER_ERROR: 500,
  },

  // Rate limits per minute for different services
  RATE_LIMITS: {
    DEFAULT: 100,  // Default rate limit
    AUTH: 20,      // Authentication endpoints
    WORKFLOW: 50,  // Workflow management
    INTEGRATION: 30, // Integration operations
    EXECUTION: 100,  // Workflow executions
  },
} as const;

/**
 * Helper function to replace URL parameters with actual values
 * @param endpoint - The endpoint template with parameters
 * @param params - Object containing parameter values
 * @returns Formatted URL with replaced parameters
 */
export const formatEndpoint = (endpoint: string, params: Record<string, string | number>): string => {
  let formattedEndpoint = endpoint;
  Object.entries(params).forEach(([key, value]) => {
    formattedEndpoint = formattedEndpoint.replace(`:${key}`, String(value));
  });
  return formattedEndpoint;
};

/**
 * Helper function to build full API URL
 * @param endpoint - The API endpoint
 * @returns Complete API URL
 */
export const buildApiUrl = (endpoint: string): string => {
  return `${BASE_URL}${endpoint}`;
};

/**
 * Type definitions for API endpoints
 */
export type ApiEndpoint = typeof API_ENDPOINTS;
export type AuthEndpoint = typeof API_ENDPOINTS.AUTH;
export type WorkflowEndpoint = typeof API_ENDPOINTS.WORKFLOW;
export type IntegrationEndpoint = typeof API_ENDPOINTS.INTEGRATION;
export type ExecutionEndpoint = typeof API_ENDPOINTS.EXECUTION;