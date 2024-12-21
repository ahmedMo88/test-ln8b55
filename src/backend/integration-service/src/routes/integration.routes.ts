// External imports with version specifications
import { Router } from 'express'; // ^4.18.2
import { rateLimit } from 'express-rate-limit'; // ^6.9.0
import passport from 'passport'; // ^0.6.0
import swaggerJsdoc from 'swagger-jsdoc'; // ^6.2.8
import { Logger } from '@nestjs/common'; // ^10.0.0
import { metrics } from '@opentelemetry/api'; // ^1.7.0

// Internal imports
import { IntegrationController } from '../controllers/integration.controller';
import { ConnectionModel, ConnectionStatus } from '../models/connection.model';
import { ServiceType } from '../config/integrations';

// Initialize logger
const logger = new Logger('IntegrationRoutes');

/**
 * Configures and returns the Express router with security middleware and monitoring
 * @param controller IntegrationController instance
 * @returns Configured Express router
 */
export default function configureRoutes(controller: IntegrationController): Router {
  const router = Router();

  // Configure rate limiting middleware
  const standardRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: res.getHeader('Retry-After')
      });
    }
  });

  const oauthRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 60, // Stricter limit for OAuth endpoints
    standardHeaders: true,
    legacyHeaders: false
  });

  // Health check endpoint - no auth required
  router.get('/health', async (req, res) => {
    try {
      const health = await controller.checkHealth();
      res.json(health);
    } catch (error) {
      logger.error(`Health check failed: ${error.message}`);
      res.status(500).json({ error: 'Service unavailable' });
    }
  });

  // Protected routes - require JWT authentication
  router.use(passport.authenticate('jwt', { session: false }));

  // List connections
  router.get('/connections',
    standardRateLimit,
    async (req, res, next) => {
      try {
        const connections = await controller.listConnections(req);
        const meter = metrics.getMeter('integration_service');
        meter.createCounter('connections.list').add(1);
        res.json(connections);
      } catch (error) {
        next(error);
      }
    }
  );

  // Get specific connection
  router.get('/connections/:id',
    standardRateLimit,
    async (req, res, next) => {
      try {
        const connection = await controller.getConnection(req.params.id, req);
        if (!connection) {
          return res.status(404).json({ error: 'Connection not found' });
        }
        res.json(connection);
      } catch (error) {
        next(error);
      }
    }
  );

  // Initiate OAuth flow
  router.post('/oauth/authorize',
    oauthRateLimit,
    async (req, res, next) => {
      try {
        const { serviceType, redirectUri } = req.body;
        if (!serviceType || !redirectUri) {
          return res.status(400).json({
            error: 'Missing required parameters'
          });
        }

        const result = await controller.initiateOAuth(serviceType, redirectUri, req);
        const meter = metrics.getMeter('integration_service');
        meter.createCounter('oauth.initiate').add(1);
        res.json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  // Handle OAuth callback
  router.post('/oauth/callback',
    oauthRateLimit,
    async (req, res, next) => {
      try {
        const { code, state, redirectUri } = req.body;
        if (!code || !state || !redirectUri) {
          return res.status(400).json({
            error: 'Missing required parameters'
          });
        }

        const connection = await controller.handleOAuthCallback(
          code,
          state,
          redirectUri,
          req
        );
        const meter = metrics.getMeter('integration_service');
        meter.createCounter('oauth.callback').add(1);
        res.json(connection);
      } catch (error) {
        next(error);
      }
    }
  );

  // Delete connection
  router.delete('/connections/:id',
    standardRateLimit,
    async (req, res, next) => {
      try {
        await controller.deleteConnection(req.params.id, req);
        const meter = metrics.getMeter('integration_service');
        meter.createCounter('connections.delete').add(1);
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    }
  );

  // Error handling middleware
  router.use((error: Error, req: any, res: any, next: any) => {
    logger.error(`Request failed: ${error.message}`, {
      path: req.path,
      method: req.method,
      error: error.stack
    });

    // Handle specific error types
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.message
      });
    }

    if (error.name === 'UnauthorizedError') {
      return res.status(401).json({
        error: 'Unauthorized',
        details: error.message
      });
    }

    // Default error response
    res.status(500).json({
      error: 'Internal server error',
      requestId: req.id
    });
  });

  return router;
}