// Rate limiting middleware with Redis storage - v6.7.0
import rateLimit from 'express-rate-limit';
// Redis store for distributed rate limiting - v3.0.0
import RedisStore from 'rate-limit-redis';
// Redis client for distributed storage - v5.3.0
import Redis from 'ioredis';
// Custom request type with auth data
import { AuthRequest } from '../middleware/auth';
// Error handling utilities
import { ApiError, ERROR_TYPES } from '../middleware/error-handler';

/**
 * Constants for rate limiting configuration
 */
const DEFAULT_WINDOW_MS = 60000; // 1 minute in milliseconds
const DEFAULT_MAX_REQUESTS = 100;
const BURST_MULTIPLIER = 1.2;
const REDIS_PREFIX = 'rl:';

/**
 * Role-based rate limits (requests per minute)
 */
const ROLE_LIMITS: RoleLimits = {
  admin: 1000,
  teamLead: 500,
  developer: 200,
  analyst: 100,
  viewer: 50
};

/**
 * Default IP-based rate limit for unauthenticated requests
 */
const IP_RATE_LIMIT = 50;

/**
 * Interface for role-based rate limits
 */
interface RoleLimits {
  admin: number;
  teamLead: number;
  developer: number;
  analyst: number;
  viewer: number;
}

/**
 * Interface for rate limit configuration options
 */
interface RateLimitConfig {
  windowMs?: number;
  max?: number;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  enableDDoSProtection?: boolean;
  redisConfig?: {
    host: string;
    port: number;
    password?: string;
    enableCluster?: boolean;
    nodes?: { host: string; port: number }[];
  };
  monitoringConfig?: {
    enableMetrics?: boolean;
    alertThreshold?: number;
    metricsPrefix?: string;
  };
}

/**
 * Creates Redis client based on configuration
 */
const createRedisClient = (config: RateLimitConfig['redisConfig']): Redis => {
  if (config?.enableCluster && config.nodes) {
    return new Redis.Cluster(config.nodes, {
      redisOptions: {
        password: config.password,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3
      }
    });
  }

  return new Redis({
    host: config?.host || 'localhost',
    port: config?.port || 6379,
    password: config?.password,
    maxRetriesPerRequest: 3
  });
};

/**
 * Determines rate limit based on user role with burst allowance
 */
const getRoleBasedLimit = (req: AuthRequest): number => {
  if (!req.user?.roles?.length) {
    return IP_RATE_LIMIT;
  }

  // Get highest role limit
  const baseLimit = req.user.roles.reduce((max, role) => {
    const roleLimit = ROLE_LIMITS[role.toLowerCase() as keyof RoleLimits];
    return roleLimit > max ? roleLimit : max;
  }, IP_RATE_LIMIT);

  // Apply burst multiplier
  return Math.floor(baseLimit * BURST_MULTIPLIER);
};

/**
 * Creates rate limiter middleware with specified configuration
 */
export const createRateLimiter = (config: RateLimitConfig = {}) => {
  const redis = createRedisClient(config.redisConfig);

  // Configure monitoring if enabled
  if (config.monitoringConfig?.enableMetrics) {
    redis.on('error', (err) => {
      console.error('Redis Rate Limit Error:', err);
      // Implement your monitoring/alerting logic here
    });
  }

  return rateLimit({
    windowMs: config.windowMs || DEFAULT_WINDOW_MS,
    max: (req: AuthRequest): number => {
      return config.max || getRoleBasedLimit(req);
    },
    standardHeaders: config.standardHeaders ?? true,
    legacyHeaders: config.legacyHeaders ?? false,
    store: new RedisStore({
      prefix: REDIS_PREFIX,
      // Sending the Redis client instance
      client: redis as any, // Type cast needed due to RedisStore typing
      sendCommand: (...args: unknown[]) => {
        return redis.call(...args as [string, ...string[]]);
      }
    }),
    skip: (req: AuthRequest): boolean => {
      // Skip rate limiting for health checks
      return req.path === '/health';
    },
    handler: (req: AuthRequest, res, next) => {
      const error = new ApiError(
        'Too many requests, please try again later.',
        429,
        {
          retryAfter: res.getHeader('Retry-After'),
          limit: getRoleBasedLimit(req),
          windowMs: config.windowMs || DEFAULT_WINDOW_MS
        },
        true
      );
      error.name = ERROR_TYPES.RATE_LIMIT;
      next(error);
    },
    keyGenerator: (req: AuthRequest): string => {
      // Use user ID if authenticated, otherwise use IP
      return req.user?.id || req.ip;
    },
    // DDoS protection settings
    ...(config.enableDDoSProtection && {
      skipFailedRequests: false,
      requestWasSuccessful: (req: AuthRequest, res) => {
        return res.statusCode < 400;
      }
    })
  });
};

/**
 * Default rate limiter instance with standard configuration
 */
export const defaultRateLimiter = createRateLimiter({
  windowMs: DEFAULT_WINDOW_MS,
  standardHeaders: true,
  legacyHeaders: false,
  enableDDoSProtection: true,
  redisConfig: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    enableCluster: process.env.REDIS_CLUSTER === 'true'
  },
  monitoringConfig: {
    enableMetrics: true,
    alertThreshold: 0.9,
    metricsPrefix: 'api_rate_limit'
  }
});

// Export interfaces for external use
export type { RateLimitConfig, RoleLimits };