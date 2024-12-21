// Express middleware types and request handling - v4.18.0
import { Request, Response, NextFunction } from 'express';
// JWT token validation and verification - v9.0.0
import jwt from 'jsonwebtoken';
// HTTP status codes for auth responses - v2.2.0
import { StatusCodes } from 'http-status-codes';
// Redis for token blacklist and role cache - v4.6.0
import { createClient } from 'redis';
// Custom error handling
import { ApiError } from './error-handler';
// Crypto for additional security checks
import crypto from 'crypto';

// Constants
const TOKEN_HEADER = 'Authorization';
const TOKEN_PREFIX = 'Bearer';
const ALLOWED_ALGORITHMS = ['RS256', 'ES256'] as const;
const TOKEN_GRACE_PERIOD = 300; // 5 minutes in seconds
const ROLE_CACHE_TTL = 3600; // 1 hour in seconds
const MIN_TOKEN_ENTROPY = 64; // Minimum required entropy bits

const ERROR_MESSAGES = {
  NO_TOKEN: 'No authentication token provided',
  INVALID_TOKEN: 'Invalid authentication token',
  EXPIRED_TOKEN: 'Authentication token has expired',
  UNAUTHORIZED: 'Unauthorized access',
  INVALID_ALGORITHM: 'Invalid token signing algorithm',
  TOKEN_BLACKLISTED: 'Token has been revoked',
  REPLAY_DETECTED: 'Token replay detected',
  INSUFFICIENT_ENTROPY: 'Token has insufficient entropy'
} as const;

// Redis client initialization
const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 100, 3000)
  }
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.connect().catch(console.error);

// Interfaces
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles: string[];
    sessionId: string;
    tokenExp: number;
  };
  security?: {
    requestId: string;
    clientIp: string;
    userAgent: string;
  };
}

interface JWTPayload {
  sub: string;
  email: string;
  roles: string[];
  sessionId: string;
  deviceId: string;
  iat: number;
  exp: number;
  jti: string;
}

// Helper Functions
const generateRequestId = (): string => {
  return crypto.randomBytes(16).toString('hex');
};

const calculateTokenEntropy = (token: string): number => {
  const buffer = Buffer.from(token);
  return crypto.createHash('sha256').update(buffer).digest().length * 8;
};

const isTokenBlacklisted = async (jti: string): Promise<boolean> => {
  const blacklisted = await redisClient.get(`blacklist:${jti}`);
  return !!blacklisted;
};

const verifyTokenReplay = async (jti: string, userId: string): Promise<boolean> => {
  const key = `token:${userId}:${jti}`;
  const result = await redisClient.set(key, '1', {
    NX: true,
    EX: TOKEN_GRACE_PERIOD
  });
  return result === null; // Returns true if token is being replayed
};

const getRoleHierarchy = async (roles: string[]): Promise<string[]> => {
  const cacheKey = `roles:hierarchy:${roles.sort().join(',')}`;
  const cached = await redisClient.get(cacheKey);
  
  if (cached) {
    return JSON.parse(cached);
  }

  // Compute role hierarchy (example implementation)
  const hierarchy = new Set(roles);
  if (roles.includes('admin')) {
    hierarchy.add('user');
  }
  
  const result = Array.from(hierarchy);
  await redisClient.set(cacheKey, JSON.stringify(result), {
    EX: ROLE_CACHE_TTL
  });
  
  return result;
};

// Authentication Middleware
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Generate request ID and attach security context
    const requestId = generateRequestId();
    req.security = {
      requestId,
      clientIp: req.ip,
      userAgent: req.get('user-agent') || 'unknown'
    };

    // Extract token
    const authHeader = req.get(TOKEN_HEADER);
    if (!authHeader?.startsWith(TOKEN_PREFIX)) {
      throw new ApiError(ERROR_MESSAGES.NO_TOKEN, StatusCodes.UNAUTHORIZED);
    }

    const token = authHeader.slice(TOKEN_PREFIX.length + 1);

    // Verify token entropy
    if (calculateTokenEntropy(token) < MIN_TOKEN_ENTROPY) {
      throw new ApiError(ERROR_MESSAGES.INSUFFICIENT_ENTROPY, StatusCodes.BAD_REQUEST);
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_PUBLIC_KEY!, {
      algorithms: ALLOWED_ALGORITHMS,
      complete: true
    }) as jwt.JwtPayload & { payload: JWTPayload };

    // Check token blacklist
    if (await isTokenBlacklisted(decoded.payload.jti)) {
      throw new ApiError(ERROR_MESSAGES.TOKEN_BLACKLISTED, StatusCodes.UNAUTHORIZED);
    }

    // Check token replay
    if (await verifyTokenReplay(decoded.payload.jti, decoded.payload.sub)) {
      throw new ApiError(ERROR_MESSAGES.REPLAY_DETECTED, StatusCodes.UNAUTHORIZED);
    }

    // Attach user data to request
    req.user = {
      id: decoded.payload.sub,
      email: decoded.payload.email,
      roles: decoded.payload.roles,
      sessionId: decoded.payload.sessionId,
      tokenExp: decoded.payload.exp
    };

    // Set security headers
    res.set({
      'X-Request-ID': requestId,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    });

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new ApiError(ERROR_MESSAGES.EXPIRED_TOKEN, StatusCodes.UNAUTHORIZED));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new ApiError(ERROR_MESSAGES.INVALID_TOKEN, StatusCodes.UNAUTHORIZED));
    } else {
      next(error);
    }
  }
};

// Authorization Middleware
export const authorize = (allowedRoles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ApiError(ERROR_MESSAGES.UNAUTHORIZED, StatusCodes.UNAUTHORIZED);
      }

      // Check token expiration with grace period
      const now = Math.floor(Date.now() / 1000);
      if (req.user.tokenExp < now - TOKEN_GRACE_PERIOD) {
        throw new ApiError(ERROR_MESSAGES.EXPIRED_TOKEN, StatusCodes.UNAUTHORIZED);
      }

      // Get user's effective roles including hierarchy
      const effectiveRoles = await getRoleHierarchy(req.user.roles);

      // Check if user has any of the allowed roles
      const hasPermission = allowedRoles.some(role => 
        role === '*' || effectiveRoles.includes(role)
      );

      if (!hasPermission) {
        throw new ApiError(ERROR_MESSAGES.UNAUTHORIZED, StatusCodes.FORBIDDEN);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};