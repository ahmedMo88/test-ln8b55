// @ts-check
import dotenv from 'dotenv'; // ^16.0.0 - Load environment variables securely
dotenv.config();

/**
 * Rate limiting configuration interface for API protection
 */
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  blockDurationMs?: number;
}

/**
 * Retry policy configuration for external service calls
 */
interface RetryConfig {
  maxRetries: number;
  backoffMs: number;
}

/**
 * IP blocking configuration for enhanced security
 */
interface IPBlockingConfig {
  enabled: boolean;
  maxFailedAttempts: number;
  blockDurationMinutes: number;
  whitelist: string[];
}

/**
 * CORS configuration settings
 */
interface CORSConfig {
  allowCredentials: boolean;
  maxAge: number;
}

/**
 * OAuth provider configuration with enhanced security and monitoring
 */
interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  scope: string[];
  authorizationURL: string;
  tokenURL: string;
  userInfoURL: string;
  profileFields: string;
  rateLimit: RateLimitConfig;
  timeoutMs: number;
  retryPolicy: RetryConfig;
}

/**
 * Enhanced security configuration with advanced protection features
 */
interface SecurityConfig {
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
  requireMfa: boolean;
  allowedOrigins: string[];
  sessionTimeout: string;
  ipBlocking: IPBlockingConfig;
  globalRateLimit: RateLimitConfig;
  enforceStrongSessions: boolean;
  corsSettings: CORSConfig;
}

/**
 * Advanced password policy with adaptive security measures
 */
interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  expiryDays: number;
  historyCount: number;
  minComplexityScore: number;
  preventCommonPasswords: boolean;
  adaptivePasswordPolicy: boolean;
  maxRepeatingChars: number;
}

/**
 * Audit configuration for security monitoring
 */
interface AuditConfig {
  enabled: boolean;
  logLevel: string;
  retentionDays: number;
  sensitiveFields: string[];
}

/**
 * Compliance settings for regulatory requirements
 */
interface ComplianceConfig {
  gdprEnabled: boolean;
  hipaaEnabled: boolean;
  soc2Enabled: boolean;
  dataRetentionDays: number;
}

/**
 * Comprehensive authentication configuration interface
 */
export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshTokenExpiresIn: string;
  providers: Record<string, OAuthProviderConfig>;
  security: SecurityConfig;
  passwordPolicy: PasswordPolicy;
  auditSettings: AuditConfig;
  complianceSettings: ComplianceConfig;
}

/**
 * Production-ready authentication configuration
 * Implements comprehensive security measures and compliance requirements
 */
const config: AuthConfig = {
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: '1h',
  refreshTokenExpiresIn: '7d',
  
  // OAuth Provider Configurations
  providers: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackUrl: process.env.GOOGLE_CALLBACK_URL || '',
      scope: ['profile', 'email'],
      authorizationURL: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenURL: 'https://oauth2.googleapis.com/token',
      userInfoURL: 'https://www.googleapis.com/oauth2/v3/userinfo',
      profileFields: 'id,name,email,picture',
      rateLimit: {
        maxRequests: 100,
        windowMs: 60000, // 1 minute
        blockDurationMs: 900000 // 15 minutes
      },
      timeoutMs: 5000,
      retryPolicy: {
        maxRetries: 3,
        backoffMs: 1000
      }
    }
  },

  // Enhanced Security Configuration
  security: {
    maxLoginAttempts: 5,
    lockoutDurationMinutes: 15,
    requireMfa: true,
    allowedOrigins: [process.env.FRONTEND_URL || ''],
    sessionTimeout: '12h',
    ipBlocking: {
      enabled: true,
      maxFailedAttempts: 10,
      blockDurationMinutes: 30,
      whitelist: (process.env.TRUSTED_IPS || '').split(',')
    },
    globalRateLimit: {
      maxRequests: 1000,
      windowMs: 900000 // 15 minutes
    },
    enforceStrongSessions: true,
    corsSettings: {
      allowCredentials: true,
      maxAge: 7200 // 2 hours
    }
  },

  // Advanced Password Policy
  passwordPolicy: {
    minLength: 12,
    requireUppercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    expiryDays: 90,
    historyCount: 5,
    minComplexityScore: 80,
    preventCommonPasswords: true,
    adaptivePasswordPolicy: true,
    maxRepeatingChars: 2
  },

  // Audit Configuration
  auditSettings: {
    enabled: true,
    logLevel: 'info',
    retentionDays: 365,
    sensitiveFields: ['password', 'token', 'secret']
  },

  // Compliance Configuration
  complianceSettings: {
    gdprEnabled: true,
    hipaaEnabled: true,
    soc2Enabled: true,
    dataRetentionDays: 730 // 2 years
  }
};

// Validate required environment variables
const requiredEnvVars = [
  'JWT_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALLBACK_URL',
  'FRONTEND_URL'
];

requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
});

// Validate configuration
if (config.jwtSecret.length < 32) {
  throw new Error('JWT secret must be at least 32 characters long');
}

export default config;