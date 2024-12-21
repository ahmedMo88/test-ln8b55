// External dependencies
import jwt from 'jsonwebtoken'; // ^9.0.0 - JWT operations
import { createHash, randomBytes } from 'crypto'; // latest - Cryptographic operations
import { CircuitBreaker } from 'circuit-breaker-ts'; // ^2.0.0 - Circuit breaking
import { createClient, RedisClientType } from 'redis'; // ^4.0.0 - Token management

// Internal dependencies
import { 
  jwtSecret, 
  jwtExpiresIn, 
  refreshTokenExpiresIn, 
  tokenRotationPolicy 
} from '../config/auth';

// Constants for token management
const REFRESH_TOKEN_LENGTH = 64;
const TOKEN_TYPE = 'Bearer';
const MAX_TOKEN_AGE = 86400; // 24 hours in seconds
const ROTATION_THRESHOLD = 0.8; // 80% of token lifetime
const CACHE_TTL = 300; // 5 minutes
const METRICS_INTERVAL = 60; // 1 minute

/**
 * Enhanced JWT payload with security fields
 */
interface JwtPayload {
  userId: string;
  roles: string[];
  iat: number;
  exp: number;
  jti: string;
  fingerprint: string;
  deviceId: string;
}

/**
 * Token pair with metadata
 */
interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenId: string;
  metadata: {
    type: string;
    issuedAt: number;
    deviceId: string;
  };
}

/**
 * Token validation result with detailed information
 */
interface TokenValidationResult {
  valid: boolean;
  payload: JwtPayload | null;
  validationErrors: string[];
  metadata: {
    rotationRequired: boolean;
    remainingTime: number;
  };
}

/**
 * Token blacklist manager for invalidation
 */
class TokenBlacklist {
  private redisClient: RedisClientType;
  private cleanupInterval: NodeJS.Timeout;

  constructor(redisConfig: any) {
    this.redisClient = createClient(redisConfig);
    this.redisClient.connect().catch(console.error);

    // Setup periodic cleanup of expired tokens
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch(console.error);
    }, METRICS_INTERVAL * 1000);

    // Error handling
    this.redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
  }

  /**
   * Add token to blacklist
   */
  async addToBlacklist(tokenId: string, expiration: number): Promise<void> {
    if (!tokenId) throw new Error('Token ID is required');
    
    await this.redisClient.set(
      `blacklist:${tokenId}`,
      Date.now().toString(),
      {
        EX: expiration
      }
    );
  }

  /**
   * Check if token is blacklisted
   */
  async isBlacklisted(tokenId: string): Promise<boolean> {
    const result = await this.redisClient.get(`blacklist:${tokenId}`);
    return !!result;
  }

  /**
   * Cleanup expired tokens
   */
  private async cleanup(): Promise<void> {
    const pattern = 'blacklist:*';
    const stream = this.redisClient.scanStream({
      match: pattern,
      count: 100
    });

    for await (const keys of stream) {
      for (const key of keys) {
        const ttl = await this.redisClient.ttl(key);
        if (ttl <= 0) {
          await this.redisClient.del(key);
        }
      }
    }
  }
}

// Initialize circuit breaker for token operations
const breaker = new CircuitBreaker({
  timeout: 5000,
  errorThreshold: 50,
  resetTimeout: 30000
});

/**
 * Generate device fingerprint for token binding
 */
function generateFingerprint(userAgent: string, ip: string): string {
  return createHash('sha256')
    .update(`${userAgent}${ip}${jwtSecret}`)
    .digest('hex');
}

/**
 * Generate secure refresh token
 */
function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_LENGTH)
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Enterprise-grade JWT service with enhanced security features
 */
class JwtService {
  private tokenBlacklist: TokenBlacklist;

  constructor() {
    this.tokenBlacklist = new TokenBlacklist({
      url: process.env.REDIS_URL
    });
  }

  /**
   * Generate secure token pair with enhanced features
   */
  @CircuitBreaker(breaker)
  async generateTokens(
    user: any,
    options: { userAgent: string; ip: string; deviceId: string }
  ): Promise<TokenPair> {
    const tokenId = randomBytes(16).toString('hex');
    const fingerprint = generateFingerprint(options.userAgent, options.ip);

    const payload: JwtPayload = {
      userId: user.id,
      roles: user.roles,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + MAX_TOKEN_AGE,
      jti: tokenId,
      fingerprint,
      deviceId: options.deviceId
    };

    const accessToken = jwt.sign(payload, jwtSecret, {
      expiresIn: jwtExpiresIn,
      algorithm: 'HS512'
    });

    const refreshToken = generateRefreshToken();

    // Store refresh token metadata
    await this.tokenBlacklist.redisClient.set(
      `refresh:${tokenId}`,
      JSON.stringify({
        userId: user.id,
        deviceId: options.deviceId,
        fingerprint
      }),
      {
        EX: parseInt(refreshTokenExpiresIn) * 86400 // Convert days to seconds
      }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: MAX_TOKEN_AGE,
      tokenId,
      metadata: {
        type: TOKEN_TYPE,
        issuedAt: Date.now(),
        deviceId: options.deviceId
      }
    };
  }

  /**
   * Verify token with comprehensive validation
   */
  async verifyToken(
    token: string,
    options: { userAgent: string; ip: string }
  ): Promise<TokenValidationResult> {
    const validationErrors: string[] = [];

    try {
      // Verify token signature and decode payload
      const decoded = jwt.verify(token, jwtSecret, {
        algorithms: ['HS512']
      }) as JwtPayload;

      // Check if token is blacklisted
      const isBlacklisted = await this.tokenBlacklist.isBlacklisted(decoded.jti);
      if (isBlacklisted) {
        validationErrors.push('Token has been revoked');
        return {
          valid: false,
          payload: null,
          validationErrors,
          metadata: { rotationRequired: false, remainingTime: 0 }
        };
      }

      // Verify fingerprint
      const currentFingerprint = generateFingerprint(
        options.userAgent,
        options.ip
      );
      if (decoded.fingerprint !== currentFingerprint) {
        validationErrors.push('Invalid token fingerprint');
        return {
          valid: false,
          payload: null,
          validationErrors,
          metadata: { rotationRequired: false, remainingTime: 0 }
        };
      }

      // Check token age and rotation requirement
      const tokenAge = Math.floor(Date.now() / 1000) - decoded.iat;
      const remainingTime = decoded.exp - Math.floor(Date.now() / 1000);
      const rotationRequired = tokenAge > MAX_TOKEN_AGE * ROTATION_THRESHOLD;

      return {
        valid: true,
        payload: decoded,
        validationErrors: [],
        metadata: {
          rotationRequired,
          remainingTime
        }
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        validationErrors.push('Token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        validationErrors.push('Invalid token signature');
      } else {
        validationErrors.push('Token validation failed');
      }

      return {
        valid: false,
        payload: null,
        validationErrors,
        metadata: { rotationRequired: false, remainingTime: 0 }
      };
    }
  }

  /**
   * Revoke token
   */
  async revokeToken(tokenId: string): Promise<void> {
    await this.tokenBlacklist.addToBlacklist(
      tokenId,
      MAX_TOKEN_AGE
    );
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    clearInterval(this.tokenBlacklist.cleanupInterval);
    await this.tokenBlacklist.redisClient.quit();
  }
}

// Export service instance
export const jwtService = new JwtService();