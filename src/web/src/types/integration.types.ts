// External imports
import * as z from 'zod'; // v3.22.2 - Runtime type validation

/**
 * Enumeration of supported service types for integrations
 */
export enum ServiceType {
  EMAIL = 'EMAIL',
  CLOUD_STORAGE = 'CLOUD_STORAGE',
  PROJECT_MANAGEMENT = 'PROJECT_MANAGEMENT', 
  COMMUNICATION = 'COMMUNICATION',
  AI_SERVICE = 'AI_SERVICE'
}

/**
 * Enumeration of supported authentication methods
 */
export enum AuthType {
  OAUTH2 = 'OAUTH2',
  API_KEY = 'API_KEY',
  JWT = 'JWT'
}

/**
 * Enumeration of possible integration connection statuses
 */
export enum ConnectionStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  EXPIRED = 'EXPIRED',
  ERROR = 'ERROR',
  RATE_LIMITED = 'RATE_LIMITED'
}

/**
 * Interface for OAuth token management
 */
export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string[];
}

/**
 * Interface for rate limiting configuration
 */
export interface RateLimitConfig {
  requestsPerMinute: number;
  burstLimit?: number;
  cooldownPeriod?: number;
}

/**
 * Interface for health status tracking
 */
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastChecked: Date;
  uptime: number;
}

/**
 * Interface for error details
 */
interface ErrorDetails {
  code: string;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
}

/**
 * Interface for integration metadata
 */
export interface IntegrationMetadata {
  version: string;
  capabilities: string[];
  healthStatus: HealthStatus;
  lastError?: ErrorDetails;
}

/**
 * Interface for integration configuration
 */
export interface IntegrationConfig {
  serviceType: ServiceType;
  authType: AuthType;
  settings: Record<string, any>;
  rateLimits: RateLimitConfig;
}

/**
 * Main integration interface
 */
export interface Integration {
  id: string;
  userId: string;
  serviceType: ServiceType;
  authType: AuthType;
  status: ConnectionStatus;
  lastUsed: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata: IntegrationMetadata;
}

/**
 * Zod schema for runtime validation of integration configuration
 */
export const integrationConfigSchema = z.object({
  serviceType: z.nativeEnum(ServiceType),
  authType: z.nativeEnum(AuthType),
  settings: z.record(z.any()),
  rateLimits: z.object({
    requestsPerMinute: z.number().min(1),
    burstLimit: z.number().optional(),
    cooldownPeriod: z.number().optional()
  })
});

/**
 * Zod schema for runtime validation of integration metadata
 */
export const integrationMetadataSchema = z.object({
  version: z.string(),
  capabilities: z.array(z.string()),
  healthStatus: z.object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    lastChecked: z.date(),
    uptime: z.number()
  }),
  lastError: z.object({
    code: z.string(),
    message: z.string(),
    timestamp: z.date(),
    context: z.record(z.unknown()).optional()
  }).optional()
});

/**
 * Zod schema for runtime validation of complete integration
 */
export const integrationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  serviceType: z.nativeEnum(ServiceType),
  authType: z.nativeEnum(AuthType),
  status: z.nativeEnum(ConnectionStatus),
  lastUsed: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
  metadata: integrationMetadataSchema
});

/**
 * Type guard to check if an object is a valid Integration
 */
export function isIntegration(obj: unknown): obj is Integration {
  return integrationSchema.safeParse(obj).success;
}