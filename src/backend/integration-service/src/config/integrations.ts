// External imports
import { z } from 'zod'; // v3.22.2 - Runtime type validation

// Enums for service and authentication types
export enum ServiceType {
  EMAIL = 'EMAIL',
  CLOUD_STORAGE = 'CLOUD_STORAGE',
  PROJECT_MANAGEMENT = 'PROJECT_MANAGEMENT',
  COMMUNICATION = 'COMMUNICATION',
  AI_SERVICE = 'AI_SERVICE',
  DATABASE = 'DATABASE',
  ANALYTICS = 'ANALYTICS'
}

export enum AuthType {
  OAUTH2 = 'OAUTH2',
  API_KEY = 'API_KEY',
  JWT = 'JWT',
  BASIC = 'BASIC',
  CERTIFICATE = 'CERTIFICATE',
  CUSTOM = 'CUSTOM'
}

// Interface definitions
export interface ServiceEndpoints {
  authorizationUrl: string;
  tokenUrl: string;
  revokeUrl: string;
  apiBaseUrl: string;
  webhookUrl: string;
  healthCheckUrl: string;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  burstSize: number;
  retryAfter: number;
  windowSize: number;
  concurrentRequests: number;
}

export interface ServiceSettings {
  timeout: number;
  retryAttempts: number;
  maxFileSize: number;
  allowedFileTypes: string[];
  [key: string]: unknown;
}

export interface IntegrationConfig {
  serviceType: ServiceType;
  serviceName: string;
  authType: AuthType;
  endpoints: ServiceEndpoints;
  rateLimit: RateLimitConfig;
  scopes: string[];
  settings: ServiceSettings;
  version: string;
  isEnabled: boolean;
  metadata: Record<string, unknown>;
}

// Zod validation schemas
const ServiceEndpointsSchema = z.object({
  authorizationUrl: z.string().url(),
  tokenUrl: z.string().url(),
  revokeUrl: z.string().url(),
  apiBaseUrl: z.string().url(),
  webhookUrl: z.string(),
  healthCheckUrl: z.string()
});

const RateLimitConfigSchema = z.object({
  requestsPerMinute: z.number().min(1).max(10000),
  burstSize: z.number().min(1),
  retryAfter: z.number().min(0),
  windowSize: z.number().min(1000),
  concurrentRequests: z.number().min(1)
});

const ServiceSettingsSchema = z.object({
  timeout: z.number().min(1000),
  retryAttempts: z.number().min(0),
  maxFileSize: z.number().min(0),
  allowedFileTypes: z.array(z.string())
}).catchall(z.unknown());

const IntegrationConfigSchema = z.object({
  serviceType: z.nativeEnum(ServiceType),
  serviceName: z.string().min(1),
  authType: z.nativeEnum(AuthType),
  endpoints: ServiceEndpointsSchema,
  rateLimit: RateLimitConfigSchema,
  scopes: z.array(z.string()),
  settings: ServiceSettingsSchema,
  version: z.string(),
  isEnabled: z.boolean(),
  metadata: z.record(z.unknown())
});

// Predefined integration configurations
export const INTEGRATION_CONFIGS: Record<ServiceType, IntegrationConfig> = {
  [ServiceType.EMAIL]: {
    serviceType: ServiceType.EMAIL,
    serviceName: 'Gmail',
    authType: AuthType.OAUTH2,
    version: 'v1',
    isEnabled: true,
    endpoints: {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      revokeUrl: 'https://oauth2.googleapis.com/revoke',
      apiBaseUrl: 'https://gmail.googleapis.com/gmail/v1',
      webhookUrl: '/webhooks/gmail',
      healthCheckUrl: '/health/gmail'
    },
    rateLimit: {
      requestsPerMinute: 100,
      burstSize: 20,
      retryAfter: 60,
      windowSize: 60000,
      concurrentRequests: 10
    },
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send'
    ],
    settings: {
      timeout: 30000,
      retryAttempts: 3,
      maxFileSize: 25000000,
      allowedFileTypes: ['pdf', 'doc', 'docx', 'txt']
    },
    metadata: {
      region: 'global',
      tier: 'enterprise',
      supportedFeatures: ['attachments', 'labels', 'filters']
    }
  },
  // Additional service configurations would be defined here
} as const;

// Validation functions
export type ValidationError = z.ZodError;
export type ConfigError = Error | ValidationError;

export const validateIntegrationConfig = (
  config: IntegrationConfig
): Result<boolean, ValidationError> => {
  try {
    IntegrationConfigSchema.parse(config);
    return { success: true, data: true };
  } catch (error) {
    return { success: false, error: error as ValidationError };
  }
};

export const getIntegrationConfig = (
  serviceType: ServiceType
): Result<IntegrationConfig, ConfigError> => {
  try {
    const config = INTEGRATION_CONFIGS[serviceType];
    if (!config) {
      throw new Error(`Integration configuration not found for service type: ${serviceType}`);
    }

    const validationResult = validateIntegrationConfig(config);
    if (!validationResult.success) {
      throw validationResult.error;
    }

    return { success: true, data: config };
  } catch (error) {
    return { success: false, error: error as ConfigError };
  }
};

// Helper type for function results
interface Result<T, E> {
  success: boolean;
  data?: T;
  error?: E;
}