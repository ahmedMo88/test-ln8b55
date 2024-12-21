// External imports with versions
import express, { Router } from 'express'; // ^4.18.0
import { body, ValidationChain } from 'express-validator'; // ^7.0.0
import rateLimit from 'express-rate-limit'; // ^6.7.0
import RedisStore from 'rate-limit-redis'; // ^3.0.0
import helmet from 'helmet'; // ^7.0.0
import { createClient } from 'redis'; // ^4.0.0
import winston from 'winston'; // ^3.11.0

// Internal imports
import { AuthController } from '../controllers/auth.controller';
import config from '../config/auth';

// Initialize Redis client for rate limiting
const redisClient = createClient({
  url: process.env.REDIS_URL
});

redisClient.connect().catch(console.error);

// Configure security logger
const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'auth-routes' },
  transports: [
    new winston.transports.File({ filename: 'security-audit.log' })
  ]
});

// Rate limiter configurations
const loginRateLimiter = rateLimit({
  store: new RedisStore({
    prefix: 'login_limit:',
    client: redisClient
  }),
  windowMs: config.security.globalRateLimit.windowMs,
  max: config.security.globalRateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    securityLogger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path
    });
    res.status(429).json({
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
});

const refreshRateLimiter = rateLimit({
  store: new RedisStore({
    prefix: 'refresh_limit:',
    client: redisClient
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  standardHeaders: true,
  legacyHeaders: false
});

// Validation middleware
const validateLoginRequest = (): ValidationChain[] => [
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email format'),
  body('password')
    .isString()
    .isLength({ min: config.passwordPolicy.minLength })
    .withMessage(`Password must be at least ${config.passwordPolicy.minLength} characters`),
  body('mfaToken')
    .optional()
    .isString()
    .isLength({ min: 6, max: 6 })
    .withMessage('Invalid MFA token format'),
  body('deviceInfo')
    .isObject()
    .withMessage('Device info is required')
    .custom((value) => {
      if (!value.deviceId || !value.userAgent || !value.platform) {
        throw new Error('Missing required device information');
      }
      return true;
    })
];

const validateRegistrationRequest = (): ValidationChain[] => [
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email format'),
  body('password')
    .isString()
    .isLength({ min: config.passwordPolicy.minLength })
    .matches(/[A-Z]/).withMessage('Password must contain uppercase letters')
    .matches(/[0-9]/).withMessage('Password must contain numbers')
    .matches(/[!@#$%^&*]/).withMessage('Password must contain special characters'),
  body('firstName')
    .trim()
    .isString()
    .isLength({ min: 2 })
    .withMessage('First name is required'),
  body('lastName')
    .trim()
    .isString()
    .isLength({ min: 2 })
    .withMessage('Last name is required'),
  body('gdprConsent')
    .isBoolean()
    .equals('true')
    .withMessage('GDPR consent is required'),
  body('deviceInfo')
    .isObject()
    .withMessage('Device info is required')
];

// Security middleware
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "same-site" },
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: true,
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true
});

// Initialize router
const router: Router = express.Router();

// Apply security headers to all routes
router.use(securityHeaders);

// Authentication routes with enhanced security
router.post('/login',
  loginRateLimiter,
  validateLoginRequest(),
  async (req, res, next) => {
    try {
      await AuthController.login(req, res);
    } catch (error) {
      securityLogger.error('Login error', {
        error: error.message,
        ip: req.ip
      });
      next(error);
    }
  }
);

router.post('/register',
  validateRegistrationRequest(),
  async (req, res, next) => {
    try {
      await AuthController.register(req, res);
    } catch (error) {
      securityLogger.error('Registration error', {
        error: error.message,
        ip: req.ip
      });
      next(error);
    }
  }
);

router.post('/refresh-token',
  refreshRateLimiter,
  async (req, res, next) => {
    try {
      await AuthController.refreshToken(req, res);
    } catch (error) {
      securityLogger.error('Token refresh error', {
        error: error.message,
        ip: req.ip
      });
      next(error);
    }
  }
);

router.get('/oauth/:provider',
  async (req, res, next) => {
    try {
      await AuthController.oauthLogin(req, res);
    } catch (error) {
      securityLogger.error('OAuth login error', {
        error: error.message,
        ip: req.ip,
        provider: req.params.provider
      });
      next(error);
    }
  }
);

router.get('/oauth/:provider/callback',
  async (req, res, next) => {
    try {
      await AuthController.oauthCallback(req, res);
    } catch (error) {
      securityLogger.error('OAuth callback error', {
        error: error.message,
        ip: req.ip,
        provider: req.params.provider
      });
      next(error);
    }
  }
);

router.post('/mfa/setup',
  async (req, res, next) => {
    try {
      await AuthController.setupMfa(req, res);
    } catch (error) {
      securityLogger.error('MFA setup error', {
        error: error.message,
        ip: req.ip
      });
      next(error);
    }
  }
);

// Error handling middleware
router.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  securityLogger.error('Route error', {
    error: err.message,
    stack: err.stack,
    ip: req.ip,
    path: req.path
  });

  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
});

// Cleanup function for graceful shutdown
const cleanup = async () => {
  try {
    await redisClient.quit();
  } catch (error) {
    securityLogger.error('Cleanup error', { error: error.message });
  }
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

export default router;