// External imports with versions
import { describe, beforeAll, afterAll, it, expect } from '@jest/globals'; // ^29.7.0
import supertest from 'supertest'; // ^6.3.3
import nock from 'nock'; // ^13.3.8
import RedisMock from 'redis-mock'; // ^0.56.3
import { Registry } from 'prom-client'; // ^14.2.0
import { randomBytes } from 'crypto';

// Internal imports
import app from '../../src/app';
import { JwtService } from '../../src/services/jwt.service';
import { OAuthService } from '../../src/services/oauth.service';
import config from '../../src/config/auth';

// Test constants
const TEST_USERS = {
  standard: {
    email: 'test@example.com',
    password: 'Test123!',
    firstName: 'Test',
    lastName: 'User',
    roles: ['user']
  },
  mfa: {
    email: 'mfa@example.com',
    password: 'Test123!',
    firstName: 'MFA',
    lastName: 'User',
    roles: ['user'],
    mfaEnabled: true
  },
  admin: {
    email: 'admin@example.com',
    password: 'Admin123!',
    firstName: 'Admin',
    lastName: 'User',
    roles: ['admin']
  }
};

const OAUTH_MOCK_RESPONSES = {
  success: {
    access_token: 'mock_access_token',
    refresh_token: 'mock_refresh_token',
    expires_in: 3600,
    token_type: 'Bearer',
    scope: 'profile email'
  },
  error: {
    error: 'invalid_grant',
    error_description: 'Invalid authorization code'
  }
};

const TEST_METRICS = {
  responseTime: 200, // ms
  maxConcurrentRequests: 50,
  rateLimitThreshold: 100
};

describe('Authentication Service Integration Tests', () => {
  let request: supertest.SuperTest<supertest.Test>;
  let redisMock: any;
  let metricsRegistry: Registry;

  beforeAll(async () => {
    // Initialize test environment
    request = supertest(app);
    redisMock = RedisMock.createClient();
    metricsRegistry = new Registry();

    // Mock Redis client
    jest.mock('redis', () => ({
      createClient: () => redisMock
    }));

    // Setup OAuth provider mocks
    nock('https://accounts.google.com')
      .persist()
      .post('/o/oauth2/v2/auth')
      .reply(200);

    nock('https://oauth2.googleapis.com')
      .persist()
      .post('/token')
      .reply(200, OAUTH_MOCK_RESPONSES.success);

    // Initialize security headers
    app.use((req, res, next) => {
      res.set({
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
      });
      next();
    });

    // Wait for all initializations to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Cleanup test environment
    await redisMock.quit();
    nock.cleanAll();
    await metricsRegistry.clear();
  });

  describe('Login Endpoint Tests', () => {
    it('should successfully authenticate valid credentials', async () => {
      const response = await request
        .post('/api/v1/auth/login')
        .send({
          email: TEST_USERS.standard.email,
          password: TEST_USERS.standard.password,
          deviceInfo: {
            deviceId: randomBytes(16).toString('hex'),
            userAgent: 'test-agent',
            platform: 'test'
          }
        })
        .expect(200);

      expect(response.body).toHaveProperty('tokens');
      expect(response.body.tokens).toHaveProperty('accessToken');
      expect(response.body.tokens).toHaveProperty('refreshToken');
      expect(response.headers['strict-transport-security']).toBeDefined();
    });

    it('should enforce rate limiting', async () => {
      const requests = Array(TEST_METRICS.rateLimitThreshold + 1).fill(null);
      
      for (const _ of requests) {
        const response = await request
          .post('/api/v1/auth/login')
          .send({
            email: TEST_USERS.standard.email,
            password: TEST_USERS.standard.password
          });

        if (response.status === 429) {
          expect(response.body).toHaveProperty('error', 'Too many requests');
          break;
        }
      }
    });

    it('should handle MFA authentication flow', async () => {
      const loginResponse = await request
        .post('/api/v1/auth/login')
        .send({
          email: TEST_USERS.mfa.email,
          password: TEST_USERS.mfa.password,
          deviceInfo: {
            deviceId: randomBytes(16).toString('hex'),
            userAgent: 'test-agent',
            platform: 'test'
          }
        });

      expect(loginResponse.status).toBe(403);
      expect(loginResponse.body).toHaveProperty('error', 'MFA token required');
    });
  });

  describe('Token Lifecycle Tests', () => {
    let accessToken: string;
    let refreshToken: string;

    it('should generate valid token pair', async () => {
      const response = await request
        .post('/api/v1/auth/login')
        .send({
          email: TEST_USERS.standard.email,
          password: TEST_USERS.standard.password,
          deviceInfo: {
            deviceId: randomBytes(16).toString('hex'),
            userAgent: 'test-agent',
            platform: 'test'
          }
        });

      accessToken = response.body.tokens.accessToken;
      refreshToken = response.body.tokens.refreshToken;

      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();
    });

    it('should successfully refresh tokens', async () => {
      const response = await request
        .post('/api/v1/auth/refresh-token')
        .send({
          refreshToken,
          deviceInfo: {
            deviceId: randomBytes(16).toString('hex'),
            userAgent: 'test-agent',
            platform: 'test'
          }
        })
        .expect(200);

      expect(response.body.tokens.accessToken).not.toBe(accessToken);
    });

    it('should invalidate revoked tokens', async () => {
      await request
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });

  describe('OAuth Integration Tests', () => {
    it('should generate valid authorization URL', async () => {
      const response = await request
        .get('/api/v1/auth/oauth/google')
        .expect(200);

      expect(response.body.url).toMatch(/accounts\.google\.com/);
      expect(response.body.url).toContain('state=');
      expect(response.body.url).toContain('scope=');
    });

    it('should handle OAuth callback successfully', async () => {
      const state = randomBytes(16).toString('hex');
      const code = 'valid_auth_code';

      const response = await request
        .get(`/api/v1/auth/oauth/google/callback?state=${state}&code=${code}`)
        .expect(200);

      expect(response.body).toHaveProperty('tokens');
      expect(response.body).toHaveProperty('user');
    });

    it('should handle OAuth errors gracefully', async () => {
      const response = await request
        .get('/api/v1/auth/oauth/google/callback?error=access_denied')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Security Protocol Tests', () => {
    it('should enforce CORS policy', async () => {
      const response = await request
        .post('/api/v1/auth/login')
        .set('Origin', 'https://malicious-site.com')
        .expect(403);

      expect(response.body).toHaveProperty('error', 'CORS not allowed');
    });

    it('should include security headers', async () => {
      const response = await request.get('/api/v1/auth/health');

      expect(response.headers).toHaveProperty('strict-transport-security');
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    it('should prevent brute force attacks', async () => {
      const attempts = Array(config.security.maxLoginAttempts + 1).fill(null);
      
      for (const _ of attempts) {
        const response = await request
          .post('/api/v1/auth/login')
          .send({
            email: TEST_USERS.standard.email,
            password: 'wrong_password',
            deviceInfo: {
              deviceId: randomBytes(16).toString('hex'),
              userAgent: 'test-agent',
              platform: 'test'
            }
          });

        if (response.status === 403) {
          expect(response.body).toHaveProperty('error', 'Account is locked');
          break;
        }
      }
    });
  });
});