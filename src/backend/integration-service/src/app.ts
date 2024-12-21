// External imports with version specifications
import express from 'express'; // ^4.18.2
import helmet from 'helmet'; // ^7.0.0
import cors from 'cors'; // ^2.8.5
import compression from 'compression'; // ^1.7.4
import morgan from 'morgan'; // ^1.10.0
import passport from 'passport'; // ^0.6.0
import winston from 'winston'; // ^3.11.0
import { v4 as uuidv4 } from 'uuid'; // ^9.0.0
import { metrics } from '@opentelemetry/api'; // ^1.7.0
import { createTerminus } from '@godaddy/terminus'; // ^4.12.0

// Internal imports
import configureRoutes from './routes/integration.routes';
import { IntegrationController } from './controllers/integration.controller';
import { INTEGRATION_CONFIGS } from './config/integrations';

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'integration-service' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Initialize Express app
const app = express();

/**
 * Configures Express application middleware stack with security and monitoring
 * @param app Express application instance
 */
function configureMiddleware(app: express.Application): void {
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: { allow: false },
    expectCt: { enforce: true, maxAge: 30 },
    frameguard: { action: 'deny' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true
  }));

  // CORS configuration
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400
  }));

  // Request parsing
  app.use(express.json({ limit: process.env.REQUEST_LIMIT || '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: process.env.REQUEST_LIMIT || '10mb' }));
  
  // Compression
  app.use(compression());

  // Request ID tracking
  app.use((req, res, next) => {
    req.id = uuidv4();
    res.setHeader('X-Request-ID', req.id);
    next();
  });

  // Logging
  app.use(morgan('combined', {
    stream: { write: message => logger.info(message.trim()) }
  }));

  // Passport initialization
  app.use(passport.initialize());

  // Performance monitoring
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const meter = metrics.getMeter('http_requests');
      meter.createHistogram('duration').record(duration, {
        path: req.path,
        method: req.method,
        status: res.statusCode.toString()
      });
    });
    next();
  });
}

/**
 * Configures comprehensive error handling middleware
 * @param app Express application instance
 */
function configureErrorHandling(app: express.Application): void {
  // 404 handler
  app.use((req, res, next) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested resource does not exist',
      requestId: req.id
    });
  });

  // Global error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled error:', {
      error: err.message,
      stack: err.stack,
      requestId: req.id,
      path: req.path,
      method: req.method
    });

    // Handle specific error types
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation Error',
        message: err.message,
        requestId: req.id
      });
    }

    if (err.name === 'UnauthorizedError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or missing authentication token',
        requestId: req.id
      });
    }

    // Default error response
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      requestId: req.id
    });
  });
}

/**
 * Initializes and starts the Express server with monitoring
 * @param app Express application instance
 */
async function startServer(app: express.Application): Promise<void> {
  const port = process.env.PORT || 3002;
  
  // Health check function
  const healthCheck = async () => {
    // Add service-specific health checks here
    return {
      uptime: process.uptime(),
      timestamp: Date.now(),
      status: 'healthy'
    };
  };

  // Configure graceful shutdown
  const server = createTerminus(app.listen(port), {
    signal: 'SIGINT',
    healthChecks: {
      '/health': healthCheck,
      verbatim: true
    },
    onSignal: async () => {
      logger.info('Server is shutting down');
      // Add cleanup logic here
    },
    onShutdown: async () => {
      logger.info('Cleanup completed, server is shut down');
    }
  });

  logger.info(`Integration service started on port ${port}`);
}

// Configure application
configureMiddleware(app);

// Initialize controller and routes
const integrationController = new IntegrationController();
app.use('/api/v1', configureRoutes(integrationController));

// Configure error handling
configureErrorHandling(app);

// Start server
startServer(app).catch(error => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

// Export app for testing
export { app };