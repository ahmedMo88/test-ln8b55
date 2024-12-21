/**
 * @fileoverview Application routing constants and helper functions
 * @version 1.0.0
 * 
 * Defines type-safe routing constants and helper functions for navigation
 * and URL management across the frontend application. Implements a hierarchical
 * routing structure with support for dynamic route generation.
 */

/**
 * Type definitions for route parameters
 */
export type RouteParams = {
  workflowId: string;
  service: string;
};

/**
 * Type definitions for workflow route types
 */
export type WorkflowRouteType = keyof typeof WORKFLOW_ROUTES;

/**
 * Type definitions for integration route types
 */
export type IntegrationRouteType = keyof typeof INTEGRATION_ROUTES;

/**
 * Authentication related route constants
 */
export const AUTH_ROUTES = {
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  FORGOT_PASSWORD: '/auth/forgot-password',
  RESET_PASSWORD: '/auth/reset-password/:token',
  VERIFY_EMAIL: '/auth/verify/:token',
  OAUTH_CALLBACK: '/auth/oauth/:provider/callback'
} as const;

/**
 * Dashboard related route constants
 */
export const DASHBOARD_ROUTES = {
  HOME: '/',
  DASHBOARD: '/dashboard',
  ANALYTICS: '/dashboard/analytics',
  NOTIFICATIONS: '/dashboard/notifications'
} as const;

/**
 * Workflow management route constants
 */
export const WORKFLOW_ROUTES = {
  LIST: '/workflows',
  CREATE: '/workflows/create',
  EDIT: '/workflows/:workflowId',
  PREVIEW: '/workflows/:workflowId/preview',
  DEPLOY: '/workflows/:workflowId/deploy',
  HISTORY: '/workflows/:workflowId/history',
  ANALYTICS: '/workflows/:workflowId/analytics'
} as const;

/**
 * Integration management route constants
 */
export const INTEGRATION_ROUTES = {
  LIST: '/integrations',
  CONFIGURE: '/integrations/:service',
  CALLBACK: '/integrations/:service/callback',
  SETTINGS: '/integrations/:service/settings',
  LOGS: '/integrations/:service/logs'
} as const;

/**
 * User profile and settings route constants
 */
export const USER_ROUTES = {
  PROFILE: '/profile',
  SETTINGS: '/settings',
  SECURITY: '/settings/security',
  API_KEYS: '/settings/api-keys',
  BILLING: '/settings/billing'
} as const;

/**
 * Validates workflow ID format
 */
const validateWorkflowId = (workflowId: string): boolean => {
  // UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(workflowId);
};

/**
 * Validates service name format
 */
const validateServiceName = (service: string): boolean => {
  // Alphanumeric with hyphens, 2-50 chars
  const serviceRegex = /^[a-z0-9-]{2,50}$/i;
  return serviceRegex.test(service);
};

/**
 * Generates a type-safe workflow route with parameter validation
 * @param workflowId - The workflow identifier
 * @param routeType - The type of workflow route to generate
 * @returns Generated and validated workflow route path
 * @throws Error if workflowId is invalid
 */
export const generateWorkflowRoute = (workflowId: string, routeType: WorkflowRouteType): string => {
  if (!validateWorkflowId(workflowId)) {
    throw new Error('Invalid workflow ID format');
  }

  const baseRoute = WORKFLOW_ROUTES[routeType];
  return baseRoute.replace(':workflowId', workflowId);
};

/**
 * Generates a type-safe integration route with parameter validation
 * @param service - The service identifier
 * @param routeType - The type of integration route to generate
 * @returns Generated and validated integration route path
 * @throws Error if service name is invalid
 */
export const generateIntegrationRoute = (service: string, routeType: IntegrationRouteType): string => {
  if (!validateServiceName(service)) {
    throw new Error('Invalid service name format');
  }

  const baseRoute = INTEGRATION_ROUTES[routeType];
  return baseRoute.replace(':service', service);
};

/**
 * Validates a generated route against defined patterns and security rules
 * @param route - The route to validate
 * @returns Boolean indicating if route is valid
 */
export const validateRoute = (route: string): boolean => {
  // Route must start with /
  if (!route.startsWith('/')) {
    return false;
  }

  // Route must not contain consecutive slashes
  if (route.includes('//')) {
    return false;
  }

  // Route must not contain special characters except allowed ones
  const validRouteRegex = /^[/a-z0-9-:]+$/i;
  if (!validRouteRegex.test(route)) {
    return false;
  }

  // Route parameters must be properly formatted
  const paramRegex = /:[a-z]+/g;
  const params = route.match(paramRegex) || [];
  for (const param of params) {
    if (param.length < 2) {
      return false;
    }
  }

  return true;
};

/**
 * Type guard to check if a string is a valid route
 */
export const isValidRoute = (route: string): route is string => {
  return validateRoute(route);
};

// Export all route constants for use across the application
export {
  DASHBOARD_ROUTES,
  WORKFLOW_ROUTES,
  INTEGRATION_ROUTES,
  USER_ROUTES
};