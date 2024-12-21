// Express middleware and routing framework - v4.18.0
import { Request, Response, RequestHandler } from 'express';
// Advanced HTTP proxy middleware with monitoring - v2.0.6
import { createProxyMiddleware, Options as ProxyOptions } from 'http-proxy-middleware';
// Sophisticated circuit breaker implementation - v7.0.0
import CircuitBreaker from 'opossum';
// Comprehensive metrics collection and monitoring - v14.2.0
import { Registry, Counter, Histogram } from 'prom-client';

// Internal imports
import { ApiError } from '../middleware/error-handler';
import { createRateLimiter } from '../config/rate-limit';
import { AuthRequest } from '../middleware/auth';

// Initialize Prometheus registry
const registry = new Registry();

// Prometheus metrics
const requestCounter = new Counter({
  name: 'proxy_requests_total',
  help: 'Total number of proxy requests',
  labelNames: ['service', 'method', 'status'],
  registers: [registry]
});

const responseTimeHistogram = new Histogram({
  name: 'proxy_response_time_seconds',
  help: 'Response time in seconds',
  labelNames: ['service'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [registry]
});

// Interfaces
export interface ProxyConfig {
  target: string;
  pathRewrite?: { [key: string]: string };
  changeOrigin?: boolean;
  headers?: { [key: string]: string };
  security?: {
    enableRateLimit?: boolean;
    enableCircuitBreaker?: boolean;
    validateContentType?: boolean;
    maxBodySize?: number;
  };
  monitoring?: {
    enableMetrics?: boolean;
    logLevel?: 'error' | 'warn' | 'info' | 'debug';
    sampleRate?: number;
  };
}

export interface ServiceRoute {
  path: string;
  service: string;
  methods: string[];
  config?: ProxyConfig;
  rateLimit?: {
    window: number;
    max: number;
  };
  security?: {
    roles?: string[];
    validatePayload?: boolean;
  };
}

// Constants
export const SERVICE_ROUTES: ServiceRoute[] = [
  {
    path: '/api/v1/workflows',
    service: 'workflow-engine',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    rateLimit: {
      window: 60000,
      max: 100
    }
  },
  {
    path: '/api/v1/ai',
    service: 'ai-service',
    methods: ['POST'],
    rateLimit: {
      window: 60000,
      max: 60
    }
  }
];

const CIRCUIT_BREAKER_OPTIONS = {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  rollingCountTimeout: 10000
};

const RETRY_OPTIONS = {
  retries: 3,
  factor: 2,
  minTimeout: 1000,
  maxTimeout: 5000,
  randomize: true
};

// Helper function to collect metrics
function collectMetrics(service: string, statusCode: number, responseTime: number): void {
  if (statusCode >= 500) {
    requestCounter.labels(service, 'error', statusCode.toString()).inc();
  } else {
    requestCounter.labels(service, 'success', statusCode.toString()).inc();
  }
  responseTimeHistogram.labels(service).observe(responseTime / 1000);
}

// Error handling function with retry logic
async function handleProxyError(error: Error, req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const service = (req as AuthRequest).security?.requestId || 'unknown';

  // Log error details
  console.error('Proxy Error:', {
    service,
    error: error.message,
    stack: error.stack,
    requestId: (req as AuthRequest).security?.requestId
  });

  // Update error metrics
  requestCounter.labels(service, 'error', '500').inc();

  // Generate error response
  const apiError = new ApiError(
    'Service temporarily unavailable',
    503,
    {
      originalError: error.message,
      service,
      requestId: (req as AuthRequest).security?.requestId
    },
    true
  );

  // Log error using ApiError's built-in logging
  apiError.logError();

  // Send error response
  res.status(apiError.statusCode).json({
    success: false,
    message: apiError.message,
    requestId: apiError.requestId,
    timestamp: apiError.timestamp
  });

  // Record final metrics
  collectMetrics(service, apiError.statusCode, Date.now() - startTime);
}

// Create proxy middleware with circuit breaker and monitoring
export function createServiceProxy(route: ServiceRoute, config: ProxyConfig): RequestHandler {
  // Initialize rate limiter if enabled
  const rateLimiter = config.security?.enableRateLimit
    ? createRateLimiter({
        windowMs: route.rateLimit?.window,
        max: route.rateLimit?.max,
        standardHeaders: true,
        enableDDoSProtection: true
      })
    : null;

  // Initialize circuit breaker
  const breaker = new CircuitBreaker(async (req: Request, res: Response) => {
    const proxyOptions: ProxyOptions = {
      target: config.target,
      changeOrigin: config.changeOrigin ?? true,
      pathRewrite: config.pathRewrite,
      headers: {
        ...config.headers,
        'x-request-id': (req as AuthRequest).security?.requestId,
        'x-forwarded-for': req.ip
      },
      proxyTimeout: CIRCUIT_BREAKER_OPTIONS.timeout,
      onError: (err: Error, req: Request, res: Response) => {
        handleProxyError(err, req, res);
      },
      onProxyRes: (proxyRes, req, res) => {
        // Collect metrics
        if (config.monitoring?.enableMetrics) {
          const responseTime = Date.now() - (req as any).startTime;
          collectMetrics(route.service, proxyRes.statusCode, responseTime);
        }

        // Add security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      }
    };

    return createProxyMiddleware(proxyOptions)(req, res);
  }, CIRCUIT_BREAKER_OPTIONS);

  // Circuit breaker event handlers
  breaker.on('open', () => {
    console.warn(`Circuit breaker opened for service: ${route.service}`);
  });

  breaker.on('halfOpen', () => {
    console.info(`Circuit breaker half-opened for service: ${route.service}`);
  });

  breaker.on('close', () => {
    console.info(`Circuit breaker closed for service: ${route.service}`);
  });

  // Return middleware chain
  return async (req: Request, res: Response, next) => {
    try {
      // Start timing for metrics
      (req as any).startTime = Date.now();

      // Apply rate limiting if enabled
      if (rateLimiter) {
        await new Promise((resolve) => rateLimiter(req, res, resolve));
      }

      // Validate request method
      if (!route.methods.includes(req.method)) {
        throw new ApiError(`Method ${req.method} not allowed`, 405);
      }

      // Validate content type if required
      if (config.security?.validateContentType && req.method !== 'GET') {
        const contentType = req.get('Content-Type');
        if (!contentType?.includes('application/json')) {
          throw new ApiError('Invalid Content-Type', 415);
        }
      }

      // Execute request through circuit breaker
      await breaker.fire(req, res);
    } catch (error) {
      next(error);
    }
  };
}