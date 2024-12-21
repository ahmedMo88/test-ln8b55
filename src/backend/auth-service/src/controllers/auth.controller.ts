// External imports with versions
import { Request, Response } from 'express'; // ^4.18.0
import bcrypt from 'bcryptjs'; // ^2.4.3
import speakeasy from 'speakeasy'; // ^2.0.0
import winston from 'winston'; // ^3.11.0
import rateLimit from 'express-rate-limit'; // ^7.1.0
import { RateLimiterRedis } from 'rate-limiter-flexible'; // ^4.0.0

// Internal imports
import User from '../models/user.model';
import { jwtService } from '../services/jwt.service';
import config from '../config/auth';

// Configure security logger
const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'auth-controller' },
  transports: [
    new winston.transports.File({ filename: 'security-audit.log' })
  ]
});

// Rate limiter configuration
const loginRateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'login_attempt',
  points: config.security.globalRateLimit.maxRequests,
  duration: config.security.globalRateLimit.windowMs / 1000,
  blockDuration: config.security.ipBlocking.blockDurationMinutes * 60
});

// Interfaces
interface LoginRequest {
  email: string;
  password: string;
  mfaToken?: string;
  deviceInfo: {
    deviceId: string;
    userAgent: string;
    platform: string;
  };
  clientIp: string;
}

interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  gdprConsent: boolean;
  deviceInfo: {
    deviceId: string;
    userAgent: string;
    platform: string;
  };
}

// Decorators
function asyncHandler(fn: Function) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      securityLogger.error('Authentication error', {
        error: error.message,
        ip: req.ip,
        endpoint: req.path
      });
      res.status(500).json({ 
        error: 'Authentication failed',
        code: 'AUTH_ERROR'
      });
    }
  };
}

function audit(action: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const [req] = args;
      const result = await originalMethod.apply(this, args);
      
      await securityLogger.info(action, {
        userId: req.user?.id,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString()
      });
      
      return result;
    };
    return descriptor;
  };
}

// Auth Controller Implementation
class AuthController {
  /**
   * User login with enhanced security features
   */
  @asyncHandler
  @audit('user_login_attempt')
  async login(req: Request, res: Response): Promise<Response> {
    const { email, password, mfaToken, deviceInfo, clientIp }: LoginRequest = req.body;

    // Rate limiting check
    try {
      await loginRateLimiter.consume(clientIp);
    } catch (error) {
      securityLogger.warn('Rate limit exceeded', { ip: clientIp });
      return res.status(429).json({
        error: 'Too many login attempts',
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    // Find and validate user
    const user = await User.findOne({ email }).select('+password +mfaSecret');
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Check account status
    if (!user.isActive || user.isLocked) {
      securityLogger.warn('Attempt to access locked account', {
        userId: user.id,
        ip: clientIp
      });
      return res.status(403).json({
        error: 'Account is locked',
        code: 'ACCOUNT_LOCKED'
      });
    }

    // Validate password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      await user.incrementLoginAttempts();
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // MFA validation if enabled
    if (user.isMfaEnabled) {
      if (!mfaToken) {
        return res.status(403).json({
          error: 'MFA token required',
          code: 'MFA_REQUIRED'
        });
      }

      const isValidMfa = user.validateMfaToken(mfaToken);
      if (!isValidMfa) {
        securityLogger.warn('Invalid MFA attempt', {
          userId: user.id,
          ip: clientIp
        });
        return res.status(401).json({
          error: 'Invalid MFA token',
          code: 'INVALID_MFA'
        });
      }
    }

    // Generate tokens
    const tokens = await jwtService.generateTokens(user, {
      userAgent: deviceInfo.userAgent,
      ip: clientIp,
      deviceId: deviceInfo.deviceId
    });

    // Update user metrics
    await User.updateOne(
      { _id: user.id },
      {
        $set: {
          lastLogin: new Date(),
          loginAttempts: 0
        }
      }
    );

    // Add security headers
    res.set({
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block'
    });

    // Log successful login
    await user.addAuditLogEntry({
      action: 'login',
      ipAddress: clientIp,
      userAgent: deviceInfo.userAgent,
      details: {
        deviceId: deviceInfo.deviceId,
        platform: deviceInfo.platform
      }
    });

    return res.status(200).json({
      tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: user.roles
      }
    });
  }

  /**
   * User registration with GDPR compliance
   */
  @asyncHandler
  @audit('user_registration')
  async register(req: Request, res: Response): Promise<Response> {
    const {
      email,
      password,
      firstName,
      lastName,
      gdprConsent,
      deviceInfo
    }: RegisterRequest = req.body;

    // Validate GDPR consent
    if (!gdprConsent) {
      return res.status(400).json({
        error: 'GDPR consent required',
        code: 'GDPR_CONSENT_REQUIRED'
      });
    }

    // Check password strength
    if (!this.validatePasswordStrength(password)) {
      return res.status(400).json({
        error: 'Password does not meet security requirements',
        code: 'WEAK_PASSWORD'
      });
    }

    // Create user with enhanced security
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      roles: ['user'],
      dataRetentionPolicy: config.complianceSettings.dataRetentionDays
    });

    // Record GDPR consent
    await user.addConsentRecord({
      type: 'gdpr_registration',
      granted: true,
      ipAddress: req.ip,
      userAgent: deviceInfo.userAgent
    });

    securityLogger.info('New user registered', {
      userId: user.id,
      ip: req.ip
    });

    return res.status(201).json({
      message: 'Registration successful',
      userId: user.id
    });
  }

  /**
   * Token refresh with security validation
   */
  @asyncHandler
  @audit('token_refresh')
  async refreshToken(req: Request, res: Response): Promise<Response> {
    const { refreshToken, deviceInfo } = req.body;

    const validation = await jwtService.verifyToken(refreshToken, {
      userAgent: deviceInfo.userAgent,
      ip: req.ip
    });

    if (!validation.valid) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }

    const user = await User.findById(validation.payload?.userId);
    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const tokens = await jwtService.generateTokens(user, {
      userAgent: deviceInfo.userAgent,
      ip: req.ip,
      deviceId: deviceInfo.deviceId
    });

    return res.status(200).json({ tokens });
  }

  /**
   * Validate password strength against security policy
   */
  private validatePasswordStrength(password: string): boolean {
    const { passwordPolicy } = config;
    
    return password.length >= passwordPolicy.minLength &&
           /[A-Z]/.test(password) &&
           /[0-9]/.test(password) &&
           /[!@#$%^&*]/.test(password) &&
           !/(.)\1{2,}/.test(password); // No more than 2 repeating characters
  }
}

export const authController = new AuthController();