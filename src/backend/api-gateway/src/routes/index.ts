// Express framework and types - v4.18.0
import express, { Router, Request, Response } from 'express';
// Security middleware for HTTP headers - v6.0.0
import helmet from 'helmet';
// CORS middleware with enhanced security - v2.8.5
import cors from 'cors';
// Prometheus metrics collection - v14.2.0
import { Registry, Counter, Histogram } from 'prom-client';

// Internal imports
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { errorHandler } from '../middleware/error-handler';
import { requestLogger } from '../middleware/logging';
import { createServiceProxy, ServiceRoute } from '../services/proxy';
import { createRateLimiter } from '../config/rate-limit';

// API version prefix
const API_PREFIX = '/api/v1';

// Initialize Prometheus registry
const registry = new Registry();

// Define metrics
const routeRequestCounter = new Counter({
  name: 'api_requests_total',
  help: 'Total number of API requests',
  labelNames: ['route', 'method', 'status'],
  registers: [registry]
});

const routeLatencyHistogram = new Histogram({
  name: 'api_request_duration_seconds',
  help: 'API request duration in seconds',
  labelNames: ['route'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [registry]
});

// Service route configurations
const SERVICE_ROUTES: ServiceRoute[] = [
  {
    path: '/workflows',
    service: 'workflow-engine',
    auth: true,
    roles: ['user', 'admin'],
    rateLimit: {
      windowMs: 60000, // 1 minute
      max: 100
    },
    timeout: 30000,
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeout: 30000
    }
  },
  {
    path: '/ai',
    service: 'ai-service',
    auth: true,
    roles: ['user', 'admin'],
    rateLimit: {
      windowMs: 60000,
      max: 60
    },
    timeout: 60000,
    circuitBreaker: {
      failureThreshold: 3,
      resetTimeout: 60000
    }
  },
  {
    path: '/integrations',
    service: 'integration-service',
    auth: true,
    roles: ['user', 'admin'],
    rateLimit: {
      windowMs: 60000,
      max: 200
    },
    timeout: 15000,
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeout: 30000
    }
  }
];

/**
 * Configures global middleware for the API Gateway
 * @param app Express application instance
 */
const setupMiddleware = (app: express.Application): void => {
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-site" },
    dnsPrefetchControl: true,
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true
  }));

  // CORS configuration
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
    credentials: true,
    maxAge: 86400 // 24 hours
  }));

  // Request parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Request logging and tracking
  app.use(requestLogger);
};

/**
 * Creates service routes with security and monitoring
 * @param routes Service route configurations
 * @returns Configured Express router
 */
const createServiceRoutes = (routes: ServiceRoute[]): Router => {
  const router = Router();

  routes.forEach(route => {
    const path = `${API_PREFIX}${route.path}`;
    const middlewareChain = [];

    // Authentication if required
    if (route.auth) {
      middlewareChain.push(authenticate);
    }

    // Role-based authorization
    if (route.roles?.length) {
      middlewareChain.push(authorize(route.roles));
    }

    // Rate limiting
    if (route.rateLimit) {
      middlewareChain.push(createRateLimiter({
        windowMs: route.rateLimit.windowMs,
        max: route.rateLimit.max,
        standardHeaders: true,
        enableDDoSProtection: true
      }));
    }

    // Create service proxy
    const proxy = createServiceProxy(route, {
      target: `${process.env[`${route.service.toUpperCase()}_URL`]}`,
      pathRewrite: { [`^${path}`]: '' },
      changeOrigin: true,
      security: {
        enableRateLimit: true,
        enableCircuitBreaker: true,
        validateContentType: true
      },
      monitoring: {
        enableMetrics: true,
        logLevel: 'info',
        sampleRate: 1
      }
    });

    // Apply middleware chain and proxy
    router.use(path, ...middlewareChain, proxy);
  });

  return router;
};

/**
 * Configures health check endpoints
 * @param router Express router instance
 */
const setupHealthChecks = (router: Router): void => {
  router.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  router.get('/health/detailed', authenticate, authorize(['admin']), (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION,
      services: SERVICE_ROUTES.map(route => ({
        name: route.service,
        status: 'ok', // Add actual service health check logic
        latency: routeLatencyHistogram.labels(route.path).get()
      }))
    });
  });
};

// Create and configure router
const router = Router();
setupHealthChecks(router);
router.use(createServiceRoutes(SERVICE_ROUTES));
router.use(errorHandler);

// Export configured router
export { router, setupMiddleware };