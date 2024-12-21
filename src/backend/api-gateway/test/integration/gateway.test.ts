/**
 * @fileoverview Comprehensive integration tests for API Gateway service
 * @version 1.0.0
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import supertest from 'supertest';
import nock from 'nock';
import jwt from 'jsonwebtoken';
import RedisMock from 'ioredis-mock';

// Internal imports
import { app } from '../../src/app';
import { ApiError } from '../../src/middleware/error-handler';
import type { AuthRequest } from '../../src/middleware/auth';

// Test constants
const TEST_JWT_SECRET = 'test-secret-key';
const TEST_USER = {
  id: '123',
  email: 'test@example.com',
  roles: ['user', 'admin']
};

// Mock service endpoints
const MOCK_SERVICES = {
  WORKFLOW: 'http://workflow-service:3001',
  AI: 'http://ai-service:3002',
  INTEGRATION: 'http://integration-service:3003'
};

/**
 * Generates test JWT tokens with configurable claims
 */
const generateTestToken = (
  payload: Partial<typeof TEST_USER> = TEST_USER,
  options: { expired?: boolean; invalid?: boolean } = {}
): string => {
  const tokenPayload = {
    sub: payload.id,
    email: payload.email,
    roles: payload.roles,
    sessionId: 'test-session',
    deviceId: 'test-device',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (options.expired ? -3600 : 3600),
    jti: 'test-token-id'
  };

  return jwt.sign(
    tokenPayload,
    options.invalid ? 'wrong-secret' : TEST_JWT_SECRET,
    { algorithm: 'RS256' }
  );
};

/**
 * Sets up test environment with mocks and monitoring
 */
const setupTestServer = async () => {
  // Configure nock for service mocking
  nock.disableNetConnect();
  nock.enableNetConnect('127.0.0.1');

  // Mock Redis for rate limiting
  const redisMock = new RedisMock();
  jest.mock('ioredis', () => jest.fn(() => redisMock));

  // Initialize test server
  const testServer = supertest(app);

  return {
    server: testServer,
    redis: redisMock,
    cleanup: async () => {
      nock.cleanAll();
      await redisMock.flushall();
    }
  };
};

describe('API Gateway Integration Tests', () => {
  let testContext: Awaited<ReturnType<typeof setupTestServer>>;

  beforeAll(async () => {
    testContext = await setupTestServer();
  });

  afterAll(async () => {
    await testContext.cleanup();
  });

  describe('Authentication Middleware', () => {
    test('should reject requests without JWT token', async () => {
      const response = await testContext.server
        .get('/api/v1/workflows')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        message: 'No authentication token provided'
      });
    });

    test('should validate JWT token signature', async () => {
      const invalidToken = generateTestToken(TEST_USER, { invalid: true });
      const response = await testContext.server
        .get('/api/v1/workflows')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Invalid authentication token'
      });
    });

    test('should handle expired tokens', async () => {
      const expiredToken = generateTestToken(TEST_USER, { expired: true });
      const response = await testContext.server
        .get('/api/v1/workflows')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Authentication token has expired'
      });
    });

    test('should attach user data to request', async () => {
      const validToken = generateTestToken();
      nock(MOCK_SERVICES.WORKFLOW)
        .get('/workflows')
        .reply(200, { data: [] });

      const response = await testContext.server
        .get('/api/v1/workflows')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits', async () => {
      const validToken = generateTestToken();
      const requests = Array(101).fill(null);

      for (const [index, _] of requests.entries()) {
        const response = await testContext.server
          .get('/api/v1/workflows')
          .set('Authorization', `Bearer ${validToken}`);

        if (index === 100) {
          expect(response.status).toBe(429);
          expect(response.body).toMatchObject({
            success: false,
            message: 'Too many requests, please try again later.'
          });
          expect(response.headers['retry-after']).toBeDefined();
        }
      }
    });

    test('should track limits per user', async () => {
      const user1Token = generateTestToken({ ...TEST_USER, id: 'user1' });
      const user2Token = generateTestToken({ ...TEST_USER, id: 'user2' });

      // User 1 hits rate limit
      for (let i = 0; i < 101; i++) {
        await testContext.server
          .get('/api/v1/workflows')
          .set('Authorization', `Bearer ${user1Token}`);
      }

      // User 2 should still be able to make requests
      const response = await testContext.server
        .get('/api/v1/workflows')
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(200);

      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should return standardized error responses', async () => {
      const validToken = generateTestToken();
      nock(MOCK_SERVICES.WORKFLOW)
        .get('/workflows')
        .replyWithError('Service unavailable');

      const response = await testContext.server
        .get('/api/v1/workflows')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(503);

      expect(response.body).toMatchObject({
        success: false,
        message: 'Service temporarily unavailable',
        requestId: expect.any(String),
        timestamp: expect.any(String)
      });
    });

    test('should handle validation errors', async () => {
      const validToken = generateTestToken();
      const response = await testContext.server
        .post('/api/v1/workflows')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ invalidData: true })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        message: expect.any(String),
        details: expect.any(Object)
      });
    });

    test('should implement circuit breaker', async () => {
      const validToken = generateTestToken();
      nock(MOCK_SERVICES.WORKFLOW)
        .get('/workflows')
        .times(5)
        .replyWithError('Service unavailable');

      // Generate multiple failed requests
      for (let i = 0; i < 5; i++) {
        await testContext.server
          .get('/api/v1/workflows')
          .set('Authorization', `Bearer ${validToken}`);
      }

      // Circuit should be open
      const response = await testContext.server
        .get('/api/v1/workflows')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(503);

      expect(response.body.message).toContain('Service temporarily unavailable');
    });
  });

  describe('Service Proxying', () => {
    test('should route requests to correct service', async () => {
      const validToken = generateTestToken();
      const mockWorkflow = { id: '123', name: 'Test Workflow' };

      nock(MOCK_SERVICES.WORKFLOW)
        .get('/workflows/123')
        .reply(200, mockWorkflow);

      const response = await testContext.server
        .get('/api/v1/workflows/123')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toEqual(mockWorkflow);
    });

    test('should preserve headers and cookies', async () => {
      const validToken = generateTestToken();
      const traceId = 'test-trace-123';

      nock(MOCK_SERVICES.WORKFLOW)
        .get('/workflows')
        .matchHeader('x-trace-id', traceId)
        .reply(200, { data: [] });

      const response = await testContext.server
        .get('/api/v1/workflows')
        .set('Authorization', `Bearer ${validToken}`)
        .set('x-trace-id', traceId)
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
    });
  });

  describe('Security Features', () => {
    test('should set security headers', async () => {
      const validToken = generateTestToken();
      const response = await testContext.server
        .get('/api/v1/workflows')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.headers).toMatchObject({
        'strict-transport-security': expect.any(String),
        'x-content-type-options': 'nosniff',
        'x-frame-options': expect.any(String)
      });
    });

    test('should validate content security policy', async () => {
      const validToken = generateTestToken();
      const response = await testContext.server
        .get('/api/v1/workflows')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.headers['content-security-policy']).toBeDefined();
    });

    test('should prevent common attacks', async () => {
      const validToken = generateTestToken();
      const response = await testContext.server
        .get('/api/v1/workflows/<script>alert(1)</script>')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(400);

      expect(response.body.message).toContain('Invalid request');
    });
  });
});