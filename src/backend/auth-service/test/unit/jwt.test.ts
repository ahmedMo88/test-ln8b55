// External dependencies
import jwt from 'jsonwebtoken'; // ^9.0.0
import RedisMock from 'redis-mock'; // ^0.56.3
import { jest } from '@jest/globals'; // ^29.0.0

// Internal dependencies
import { JwtService, TokenBlacklist } from '../../src/services/jwt.service';
import config from '../../src/config/auth';
import { IUser } from '../../src/models/user.model';

// Mock Redis client
jest.mock('redis', () => RedisMock);

describe('JWT Service', () => {
  let jwtService: JwtService;
  let mockUser: IUser;
  let mockSecurityContext: {
    userAgent: string;
    ip: string;
    deviceId: string;
  };

  beforeEach(() => {
    // Initialize JWT service
    jwtService = new JwtService();

    // Setup mock user
    mockUser = {
      id: 'test-user-id',
      roles: ['user'],
      deviceFingerprint: 'mock-device-fingerprint',
      securityLevel: 2,
    } as IUser;

    // Setup security context
    mockSecurityContext = {
      userAgent: 'test-user-agent',
      ip: '127.0.0.1',
      deviceId: 'test-device-id',
    };
  });

  afterEach(async () => {
    await jwtService.cleanup();
  });

  describe('generateTokens', () => {
    it('should generate valid token pair with enhanced security fields', async () => {
      // Test token generation
      const tokens = await jwtService.generateTokens(mockUser, mockSecurityContext);

      // Verify token structure
      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(tokens).toHaveProperty('expiresIn');
      expect(tokens).toHaveProperty('tokenId');
      expect(tokens).toHaveProperty('metadata');

      // Decode and verify token payload
      const decoded = jwt.decode(tokens.accessToken) as any;
      expect(decoded).toBeTruthy();
      expect(decoded.userId).toBe(mockUser.id);
      expect(decoded.roles).toEqual(mockUser.roles);
      expect(decoded.jti).toBe(tokens.tokenId);
      expect(decoded.deviceId).toBe(mockSecurityContext.deviceId);
    });

    it('should enforce token rotation policy', async () => {
      const tokens = await jwtService.generateTokens(mockUser, mockSecurityContext);
      const decoded = jwt.decode(tokens.accessToken) as any;

      // Verify expiration and rotation settings
      expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(
        parseInt(config.jwtExpiresIn) * 3600
      );
      expect(tokens.metadata.issuedAt).toBeLessThanOrEqual(Date.now());
    });

    it('should handle concurrent token generation', async () => {
      // Test concurrent token generation
      const promises = Array(5).fill(null).map(() =>
        jwtService.generateTokens(mockUser, mockSecurityContext)
      );

      const results = await Promise.all(promises);
      const tokenIds = results.map(result => result.tokenId);

      // Verify unique token IDs
      expect(new Set(tokenIds).size).toBe(tokenIds.length);
    });

    it('should properly encrypt sensitive payload data', async () => {
      const tokens = await jwtService.generateTokens(mockUser, {
        ...mockSecurityContext,
        deviceId: 'sensitive-device-id',
      });

      const decoded = jwt.decode(tokens.accessToken) as any;
      expect(decoded.fingerprint).toBeTruthy();
      expect(decoded.fingerprint).not.toBe('sensitive-device-id');
    });
  });

  describe('verifyToken', () => {
    let validToken: string;
    let tokenId: string;

    beforeEach(async () => {
      const tokens = await jwtService.generateTokens(mockUser, mockSecurityContext);
      validToken = tokens.accessToken;
      tokenId = tokens.tokenId;
    });

    it('should successfully verify valid token', async () => {
      const result = await jwtService.verifyToken(validToken, {
        userAgent: mockSecurityContext.userAgent,
        ip: mockSecurityContext.ip,
      });

      expect(result.valid).toBe(true);
      expect(result.payload).toBeTruthy();
      expect(result.validationErrors).toHaveLength(0);
    });

    it('should reject blacklisted tokens', async () => {
      // Blacklist the token
      await jwtService.revokeToken(tokenId);

      const result = await jwtService.verifyToken(validToken, {
        userAgent: mockSecurityContext.userAgent,
        ip: mockSecurityContext.ip,
      });

      expect(result.valid).toBe(false);
      expect(result.validationErrors).toContain('Token has been revoked');
    });

    it('should validate device fingerprint', async () => {
      const result = await jwtService.verifyToken(validToken, {
        userAgent: 'different-user-agent',
        ip: mockSecurityContext.ip,
      });

      expect(result.valid).toBe(false);
      expect(result.validationErrors).toContain('Invalid token fingerprint');
    });

    it('should detect token expiration', async () => {
      // Create expired token
      const expiredToken = jwt.sign(
        {
          userId: mockUser.id,
          exp: Math.floor(Date.now() / 1000) - 3600,
        },
        config.jwtSecret
      );

      const result = await jwtService.verifyToken(expiredToken, mockSecurityContext);
      expect(result.valid).toBe(false);
      expect(result.validationErrors).toContain('Token has expired');
    });

    it('should handle invalid token signatures', async () => {
      const result = await jwtService.verifyToken('invalid.token.signature', mockSecurityContext);
      expect(result.valid).toBe(false);
      expect(result.validationErrors).toContain('Invalid token signature');
    });
  });

  describe('refreshAccessToken', () => {
    let validRefreshToken: string;
    let tokenId: string;

    beforeEach(async () => {
      const tokens = await jwtService.generateTokens(mockUser, mockSecurityContext);
      validRefreshToken = tokens.refreshToken;
      tokenId = tokens.tokenId;
    });

    it('should successfully refresh access token', async () => {
      const newTokens = await jwtService.refreshAccessToken(validRefreshToken, mockSecurityContext);

      expect(newTokens).toHaveProperty('accessToken');
      expect(newTokens).toHaveProperty('refreshToken');
      expect(newTokens.tokenId).not.toBe(tokenId);
    });

    it('should prevent refresh token reuse', async () => {
      // Use refresh token once
      await jwtService.refreshAccessToken(validRefreshToken, mockSecurityContext);

      // Attempt to reuse refresh token
      await expect(
        jwtService.refreshAccessToken(validRefreshToken, mockSecurityContext)
      ).rejects.toThrow();
    });

    it('should maintain security context during refresh', async () => {
      const newTokens = await jwtService.refreshAccessToken(validRefreshToken, mockSecurityContext);
      const decoded = jwt.decode(newTokens.accessToken) as any;

      expect(decoded.userId).toBe(mockUser.id);
      expect(decoded.roles).toEqual(mockUser.roles);
      expect(decoded.deviceId).toBe(mockSecurityContext.deviceId);
    });
  });

  describe('performanceTests', () => {
    it('should handle token generation under load', async () => {
      const startTime = Date.now();
      const iterations = 100;

      const promises = Array(iterations).fill(null).map(() =>
        jwtService.generateTokens(mockUser, mockSecurityContext)
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toHaveLength(iterations);
      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds max
    });

    it('should maintain performance during concurrent verifications', async () => {
      const tokens = await jwtService.generateTokens(mockUser, mockSecurityContext);
      const iterations = 100;

      const startTime = Date.now();
      const promises = Array(iterations).fill(null).map(() =>
        jwtService.verifyToken(tokens.accessToken, mockSecurityContext)
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toHaveLength(iterations);
      expect(results.every(r => r.valid)).toBe(true);
      expect(endTime - startTime).toBeLessThan(3000); // 3 seconds max
    });
  });
});