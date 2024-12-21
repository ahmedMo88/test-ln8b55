// External imports with versions
import express, { Application, Request, Response, NextFunction } from 'express'; // ^4.18.0
import cors from 'cors'; // ^2.8.5
import helmet from 'helmet'; // ^7.0.0
import compression from 'compression'; // ^1.7.4
import morgan from 'morgan'; // ^1.10.0
import { Registry, collectDefaultMetrics } from 'prom-client'; // ^14.0.0
import rateLimit from 'express-rate-limit'; // ^6.0.0
import CircuitBreaker from 'opossum'; // ^7.0.0
import { v4 as uuidv4 } from 'uuid'; // ^9.0.0

// Internal imports
import config from './config/auth';
import router from './routes/auth.routes';

// Initialize Express application
const app: Application = express();

// Initialize Prometheus metrics registry
const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

/**
 * Configure security and performance middleware
 */
function setupMiddleware(app: Application): void {
  // Security headers
  app.use(helmet({
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
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // CORS configuration
  app.use(cors({
    origin: config.security.allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: config.security.corsSettings.allowCredentials,
    maxAge: config.security.corsSettings.maxAge
  }));

  // Request parsing
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // Response compression
  app.use(compression());

  // Request correlation ID
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.headers['x-correlation-id'] = req.headers['x-correlation-id'] || uuidv4();
    next();
  });

  // Request logging with correlation ID
  app.use(morgan(':method :url :status :correlation-id :response-time ms', {
    stream: { write: (message) => console.log(message.trim()) }
  }));
  morgan.token('correlation-id', (req: Request) => req.headers['x-correlation-id'] as string);

  // Global rate limiting
  const limiter = rateLimit({
    windowMs: config.security.globalRateLimit.windowMs,
    max: config.security.globalRateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }
  });
  app.use(limiter);
}

/**
 * Configure routes and error handling
 */
function setupRoutes(app: Application): void {
  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'healthy' });
  });

  // Metrics endpoint
  app.get('/metrics', async (req: Request, res: Response) => {
    try {
      res.set('Content-Type', metricsRegistry.contentType);
      res.end(await metricsRegistry.metrics());
    } catch (error) {
      res.status(500).json({ error: 'Failed to collect metrics' });
    }
  });

  // Mount authentication routes
  app.use('/api/v1/auth', router);

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
      code: 'RESOURCE_NOT_FOUND'
    });
  });

  // Global error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled error:', {
      error: err.message,
      stack: err.stack,
      correlationId: req.headers['x-correlation-id']
    });

    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      correlationId: req.headers['x-correlation-id']
    });
  });
}

/**
 * Start server with graceful shutdown
 */
async function startServer(app: Application): Promise<void> {
  const port = process.env.PORT || 3001;
  const server = app.listen(port, () => {
    console.log(`Auth service listening on port ${port}`);
  });

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, starting graceful shutdown`);

    server.close(async () => {
      try {
        // Cleanup resources
        await Promise.all([
          // Add cleanup tasks here
        ]);
        console.log('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    });

    // Force shutdown after timeout
    setTimeout(() => {
      console.error('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, parseInt(process.env.SHUTDOWN_TIMEOUT || '10000'));
  };

  // Register shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Initialize application
setupMiddleware(app);
setupRoutes(app);

// Start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  startServer(app).catch(console.error);
}

export default app;