// External imports with versions
import { describe, beforeEach, test, expect, jest } from '@jest/globals'; // ^29.7.0
import MockAdapter from 'axios-mock-adapter'; // ^1.22.0
import axios from 'axios';
import { randomBytes } from 'crypto';

// Internal imports
import { OAuthService } from '../../src/services/oauth.service';
import { INTEGRATION_CONFIGS, ServiceType } from '../../src/config/integrations';
import { ConnectionModel, ConnectionStatus } from '../../src/models/connection.model';

// Mock constants
const MOCK_CLIENT_ID = 'test-client-id';
const MOCK_CLIENT_SECRET = 'test-client-secret';
const MOCK_REDIRECT_URI = 'http://localhost:3000/callback';
const MOCK_AUTH_CODE = 'test-auth-code';
const MOCK_ACCESS_TOKEN = 'test-access-token';
const MOCK_REFRESH_TOKEN = 'test-refresh-token';
const MOCK_STATE = randomBytes(16).toString('hex');
const MOCK_RATE_LIMIT_HEADERS = {
  'x-ratelimit-limit': '100',
  'x-ratelimit-remaining': '99',
  'x-ratelimit-reset': '3600'
};

describe('OAuthService', () => {
  let oauthService: OAuthService;
  let mockAxios: MockAdapter;
  let mockConnectionRepo: jest.Mocked<typeof ConnectionModel>;
  let mockTokenMetrics: jest.Mocked<any>;
  let mockCircuitBreakerFactory: jest.Mocked<any>;

  beforeEach(() => {
    // Reset environment variables
    process.env.OAUTH_CLIENT_ID = MOCK_CLIENT_ID;
    process.env.OAUTH_CLIENT_SECRET = MOCK_CLIENT_SECRET;

    // Initialize mocks
    mockAxios = new MockAdapter(axios);
    mockConnectionRepo = {
      findById: jest.fn(),
    } as any;

    mockTokenMetrics = {
      storePKCEVerifier: jest.fn(),
      retrievePKCEVerifier: jest.fn(),
      recordTokenExchange: jest.fn(),
    };

    mockCircuitBreakerFactory = {
      create: jest.fn().mockReturnValue({
        fire: jest.fn().mockImplementation((fn) => fn()),
      }),
    };

    // Initialize service
    oauthService = new OAuthService(
      mockConnectionRepo,
      mockTokenMetrics,
      mockCircuitBreakerFactory
    );
  });

  test('generateAuthUrl should create secure authorization URL with PKCE', async () => {
    // Setup
    const serviceType = ServiceType.EMAIL;
    const config = INTEGRATION_CONFIGS[serviceType];
    mockTokenMetrics.storePKCEVerifier.mockResolvedValue(undefined);

    // Execute
    const authUrl = await oauthService.generateAuthUrl(
      serviceType,
      MOCK_REDIRECT_URI,
      MOCK_STATE
    );

    // Verify
    expect(authUrl).toContain(config.endpoints.authorizationUrl);
    expect(authUrl).toContain(`client_id=${MOCK_CLIENT_ID}`);
    expect(authUrl).toContain(`redirect_uri=${encodeURIComponent(MOCK_REDIRECT_URI)}`);
    expect(authUrl).toContain('code_challenge_method=S256');
    expect(authUrl).toContain('state=' + MOCK_STATE);
    expect(authUrl).toContain('access_type=offline');
    expect(authUrl).toContain('prompt=consent');
    expect(mockTokenMetrics.storePKCEVerifier).toHaveBeenCalledWith(
      MOCK_STATE,
      expect.any(String)
    );
  });

  test('exchangeCodeForTokens should handle token exchange with PKCE verification', async () => {
    // Setup
    const serviceType = ServiceType.EMAIL;
    const config = INTEGRATION_CONFIGS[serviceType];
    const mockTokenResponse = {
      access_token: MOCK_ACCESS_TOKEN,
      refresh_token: MOCK_REFRESH_TOKEN,
      token_type: 'Bearer',
      expires_in: 3600,
    };

    mockTokenMetrics.retrievePKCEVerifier.mockResolvedValue('test-verifier');
    mockAxios.onPost(config.endpoints.tokenUrl).reply(200, mockTokenResponse, MOCK_RATE_LIMIT_HEADERS);

    // Execute
    const result = await oauthService.exchangeCodeForTokens(
      serviceType,
      MOCK_AUTH_CODE,
      MOCK_REDIRECT_URI,
      MOCK_STATE
    );

    // Verify
    expect(result).toMatchObject({
      ...mockTokenResponse,
      issued_at: expect.any(Number),
    });
    expect(mockTokenMetrics.retrievePKCEVerifier).toHaveBeenCalledWith(MOCK_STATE);
    expect(mockTokenMetrics.recordTokenExchange).toHaveBeenCalledWith(
      serviceType,
      expect.objectContaining(mockTokenResponse)
    );
  });

  test('refreshAccessToken should handle token refresh with rate limiting', async () => {
    // Setup
    const connectionId = 'test-connection-id';
    const mockConnection = {
      id: connectionId,
      serviceType: ServiceType.EMAIL,
      credentials: {
        refreshToken: MOCK_REFRESH_TOKEN,
      },
      updateTokenMetrics: jest.fn(),
      save: jest.fn(),
      updateStatus: jest.fn(),
    };

    mockConnectionRepo.findById.mockResolvedValue(mockConnection as any);
    mockAxios.onPost(INTEGRATION_CONFIGS[ServiceType.EMAIL].endpoints.tokenUrl)
      .reply(200, {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
      }, MOCK_RATE_LIMIT_HEADERS);

    // Execute
    const result = await oauthService.refreshAccessToken(connectionId);

    // Verify
    expect(result).toMatchObject({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      issued_at: expect.any(Number),
    });
    expect(mockConnection.updateTokenMetrics).toHaveBeenCalled();
    expect(mockConnection.save).toHaveBeenCalled();
  });

  test('revokeTokens should securely revoke all tokens', async () => {
    // Setup
    const connectionId = 'test-connection-id';
    const mockConnection = {
      id: connectionId,
      serviceType: ServiceType.EMAIL,
      credentials: {
        accessToken: MOCK_ACCESS_TOKEN,
        refreshToken: MOCK_REFRESH_TOKEN,
      },
      updateStatus: jest.fn(),
      save: jest.fn(),
    };

    mockConnectionRepo.findById.mockResolvedValue(mockConnection as any);
    mockAxios.onPost(INTEGRATION_CONFIGS[ServiceType.EMAIL].endpoints.revokeUrl)
      .reply(200, {}, MOCK_RATE_LIMIT_HEADERS);

    // Execute
    await oauthService.revokeTokens(connectionId);

    // Verify
    expect(mockConnection.updateStatus).toHaveBeenCalledWith(ConnectionStatus.DISCONNECTED);
    expect(mockConnection.save).toHaveBeenCalled();
    expect(mockAxios.history.post.length).toBe(2); // Both tokens revoked
  });

  test('validateTokenHealth should check token health and update metrics', async () => {
    // Setup
    const connectionId = 'test-connection-id';
    const mockConnection = {
      id: connectionId,
      validateCredentials: jest.fn().mockResolvedValue(true),
    };

    mockConnectionRepo.findById.mockResolvedValue(mockConnection as any);

    // Execute
    const result = await oauthService.validateTokenHealth(connectionId);

    // Verify
    expect(result).toBe(true);
    expect(mockConnection.validateCredentials).toHaveBeenCalled();
  });

  test('handleRateLimits should respect rate limit headers', async () => {
    // Setup
    const serviceType = ServiceType.EMAIL;
    mockAxios.onPost(INTEGRATION_CONFIGS[serviceType].endpoints.tokenUrl)
      .reply(429, {}, {
        'retry-after': '60',
        ...MOCK_RATE_LIMIT_HEADERS,
      });

    // Execute & Verify
    await expect(oauthService.exchangeCodeForTokens(
      serviceType,
      MOCK_AUTH_CODE,
      MOCK_REDIRECT_URI,
      MOCK_STATE
    )).rejects.toThrow();
  });
});