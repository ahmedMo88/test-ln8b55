/**
 * @fileoverview Enterprise-grade API Gateway service entry point
 * @version 1.0.0
 * @license MIT
 * 
 * Implements a high-performance, secure API Gateway with:
 * - Comprehensive security features
 * - Advanced monitoring and metrics
 * - Distributed rate limiting
 * - Service proxying
 * - Health checks
 */

// Express framework and middleware - v4.18.0
import express, { Application } from 'express';
// Security middleware for HTTP headers - v6.0.0
import helmet from 'helmet';
// Response compression - v1.7.4
import compression from 'compression';
// Prometheus metrics - v14.2.0
import { Registry, collectDefaultMetrics } from 'prom-client';
// Request timeout handling - v2.2.0
import timeout from 'express-timeout-handler';
// Request body parsing - v1.20.0
import bodyParser from 'body-parser';

// Internal imports
import { getCorsConfig } from './config/cors';
import { defaultRateLimiter } from './config/rate-limit';
import { authenticate } from './middleware/auth';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/logging';
import router from './routes';

// Environment variables
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '30000', 10);
const MAX_PAYLOAD_SIZE = process.env.MAX_PAYLOAD_SIZE || '1mb';

// Initialize Prometheus registry
const metricsRegistry = new Registry();

/**
 * Initializes and configures the Express application with enterprise-grade middleware
 * @returns Configured Express application instance
 */
export function initializeApp(): Application {
  const app = express();

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
  app.use(getCorsConfig());

  // Request body parsing with size limits
  app.use(bodyParser.json({ limit: MAX_PAYLOAD_SIZE }));
  app.use(bodyParser.urlencoded({ extended: true, limit: MAX_PAYLOAD_SIZE }));

  // Response compression
  app.use(compression());

  // Request timeout handling
  app.use(timeout.handler({
    timeout: REQUEST_TIMEOUT,
    onTimeout: (req, res) => {
      res.status(408).json({
        success: false,
        message: 'Request timeout',
        requestId: (req as any).id,
        timestamp: new Date().toISOString()
      });
    }
  }));

  // Request logging and correlation
  app.use(requestLogger);

  // Rate limiting
  app.use(defaultRateLimiter);

  // API routes
  app.use('/api/v1', router);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV
    });
  });

  // Detailed health check (authenticated)
  app.get('/health/detailed', authenticate, (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      version: process.env.npm_package_version,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      metrics: metricsRegistry.getMetricsAsJSON()
    });
  });

  // Metrics endpoint
  app.get('/metrics', authenticate, async (req, res) => {
    try {
      res.set('Content-Type', metricsRegistry.contentType);
      res.end(await metricsRegistry.metrics());
    } catch (error) {
      res.status(500).json({ error: 'Failed to collect metrics' });
    }
  });

  // Error handling
  app.use(errorHandler);

  return app;
}

/**
 * Configures Prometheus metrics collection
 * @param app Express application instance
 */
function setupMetrics(app: Application): void {
  // Collect default Node.js metrics
  collectDefaultMetrics({ register: metricsRegistry });

  // Custom metrics setup can be added here
  metricsRegistry.setDefaultLabels({
    app: 'api-gateway',
    environment: NODE_ENV
  });
}

/**
 * Starts the API Gateway server with graceful shutdown
 * @param app Express application instance
 */
export async function startServer(app: Application): Promise<void> {
  try {
    // Setup metrics collection
    setupMetrics(app);

    // Start server
    const server = app.listen(PORT, () => {
      console.log(`API Gateway listening on port ${PORT} in ${NODE_ENV} mode`);
    });

    // Graceful shutdown handling
    const shutdown = async () => {
      console.log('Shutting down API Gateway...');
      
      server.close((err) => {
        if (err) {
          console.error('Error during shutdown:', err);
          process.exit(1);
        }
        console.log('API Gateway shutdown complete');
        process.exit(0);
      });

      // Set timeout for forceful shutdown
      setTimeout(() => {
        console.error('Forceful shutdown due to timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    console.error('Failed to start API Gateway:', error);
    process.exit(1);
  }
}

// Start server if running directly
if (require.main === module) {
  const app = initializeApp();
  startServer(app).catch(console.error);
}

// Export configured app for testing and external use
export const app = initializeApp();