// Testing framework and assertions - v29.0.0
import { describe, test, expect, jest, beforeEach, afterEach } from 'jest';
// HTTP assertions and request testing - v6.3.0
import request from 'supertest';
// Express types and test server setup - v4.18.0
import express, { Request, Response, NextFunction } from 'express';
// JWT token generation and validation - v9.0.0
import jwt from 'jsonwebtoken';
// HTTP status codes for assertions - v2.2.0
import { StatusCodes } from 'http-status-codes';

// Import middleware components to test
import { authenticate, authorize } from '../../src/middleware/auth';
import { ApiError, errorHandler } from '../../src/middleware/error-handler';
import { requestLogger } from '../../src/middleware/logging';

// Test constants
const TEST_USER = {
  id: 'test-user-id',
  email: 'test@example.com',
  roles: ['user'],
  permissions: ['read:own', 'write:own']
};

const TEST_ADMIN = {
  id: 'test-admin-id',
  email: 'admin@example.com',
  roles: ['admin'],
  permissions: ['read:all', 'write:all', 'manage:users']
};

const MOCK_JWT_SECRET = 'test-secret-key';

const TEST_SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'",
  'X-Frame-Options': 'DENY'
};

// Test app setup
let app: express.Application;

beforeEach(() => {
  app = express();
  app.use(express.json());
  process.env.JWT_PUBLIC_KEY = MOCK_JWT_SECRET;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('Authentication Middleware', () => {
  describe('JWT Token Validation', () => {
    test('should accept valid JWT token', async () => {
      // Generate valid token
      const token = jwt.sign(
        {
          sub: TEST_USER.id,
          email: TEST_USER.email,
          roles: TEST_USER.roles,
          sessionId: 'test-session',
          jti: 'unique-token-id'
        },
        MOCK_JWT_SECRET,
        { algorithm: 'RS256', expiresIn: '1h' }
      );

      app.get('/test', authenticate, (req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(StatusCodes.OK);
      expect(response.body.success).toBe(true);
    });

    test('should reject invalid JWT token', async () => {
      app.get('/test', authenticate, (req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });
      app.use(errorHandler);

      const response = await request(app)
        .get('/test')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
      expect(response.body.message).toContain('Invalid authentication token');
    });

    test('should reject expired JWT token', async () => {
      const expiredToken = jwt.sign(
        {
          sub: TEST_USER.id,
          email: TEST_USER.email,
          roles: TEST_USER.roles
        },
        MOCK_JWT_SECRET,
        { algorithm: 'RS256', expiresIn: '-1h' }
      );

      app.get('/test', authenticate, (req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });
      app.use(errorHandler);

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
      expect(response.body.message).toContain('Authentication token has expired');
    });
  });

  describe('Security Headers', () => {
    test('should set required security headers', async () => {
      const token = jwt.sign(
        { sub: TEST_USER.id, email: TEST_USER.email, roles: TEST_USER.roles },
        MOCK_JWT_SECRET
      );

      app.get('/test', authenticate, (req: Request, res: Response) => {
        res.status(200).json({ success: true });
      });

      const response = await request(app)
        .get('/test')
        .set('Authorization', `Bearer ${token}`);

      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-request-id']).toBeDefined();
    });
  });
});

describe('Authorization Middleware', () => {
  test('should allow access with correct role', async () => {
    const token = jwt.sign(
      { sub: TEST_ADMIN.id, email: TEST_ADMIN.email, roles: TEST_ADMIN.roles },
      MOCK_JWT_SECRET
    );

    app.get('/admin', authenticate, authorize(['admin']), (req: Request, res: Response) => {
      res.status(200).json({ success: true });
    });

    const response = await request(app)
      .get('/admin')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(StatusCodes.OK);
  });

  test('should deny access with insufficient role', async () => {
    const token = jwt.sign(
      { sub: TEST_USER.id, email: TEST_USER.email, roles: TEST_USER.roles },
      MOCK_JWT_SECRET
    );

    app.get('/admin', authenticate, authorize(['admin']), (req: Request, res: Response) => {
      res.status(200).json({ success: true });
    });
    app.use(errorHandler);

    const response = await request(app)
      .get('/admin')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(StatusCodes.FORBIDDEN);
  });
});

describe('Error Handler Middleware', () => {
  test('should handle operational errors appropriately', async () => {
    app.get('/error', (req: Request, res: Response) => {
      throw new ApiError('Test operational error', StatusCodes.BAD_REQUEST);
    });
    app.use(errorHandler);

    const response = await request(app).get('/error');

    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(response.body).toMatchObject({
      success: false,
      message: 'Test operational error',
      requestId: expect.any(String),
      timestamp: expect.any(String)
    });
  });

  test('should sanitize error messages', async () => {
    app.get('/error', (req: Request, res: Response) => {
      throw new ApiError('Error with password: secret123', StatusCodes.BAD_REQUEST);
    });
    app.use(errorHandler);

    const response = await request(app).get('/error');

    expect(response.body.message).not.toContain('secret123');
    expect(response.body.message).toContain('[REDACTED]');
  });
});

describe('Request Logger Middleware', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn()
  };

  beforeEach(() => {
    jest.mock('../../src/middleware/logging', () => ({
      logger: mockLogger
    }));
  });

  test('should log request details', async () => {
    app.use(requestLogger);
    app.get('/test', (req: Request, res: Response) => {
      res.status(200).json({ success: true });
    });

    await request(app).get('/test');

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Request received',
      expect.objectContaining({
        requestId: expect.any(String),
        method: 'GET',
        url: '/test'
      })
    );
  });

  test('should track request performance metrics', async () => {
    app.use(requestLogger);
    app.get('/test', (req: Request, res: Response) => {
      res.status(200).json({ success: true });
    });

    await request(app).get('/test');

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Request completed',
      expect.objectContaining({
        metadata: expect.objectContaining({
          performanceMetrics: expect.objectContaining({
            processingTime: expect.any(Number),
            memoryUsage: expect.any(Number),
            cpuUsage: expect.any(Number)
          })
        })
      })
    );
  });
});