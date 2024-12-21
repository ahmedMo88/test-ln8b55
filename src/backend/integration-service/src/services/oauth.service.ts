// External imports with version specifications
import { Injectable, Inject, Logger } from '@nestjs/common'; // v10.0.0
import axios, { AxiosInstance } from 'axios'; // v1.6.0
import CircuitBreaker from 'opossum'; // v7.1.0
import { randomBytes, createHash } from 'crypto';

// Internal imports
import { ConnectionModel, ConnectionStatus } from '../models/connection.model';
import { 
  IntegrationConfig, 
  ServiceType, 
  getIntegrationConfig 
} from '../config/integrations';

/**
 * Interface for OAuth2 token response with enhanced metadata
 */
export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  scope?: string;
  issued_at: number;
}

/**
 * Interface for PKCE parameters
 */
interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

/**
 * Enhanced OAuth service with enterprise security features
 * Handles OAuth2 flows, token management, and monitoring
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly httpClient: AxiosInstance;
  private readonly tokenRefreshBreaker: CircuitBreaker;

  constructor(
    @Inject('CONNECTION_REPOSITORY')
    private readonly connectionRepo: typeof ConnectionModel,
    @Inject('TOKEN_METRICS_SERVICE')
    private readonly tokenMetrics: TokenMetricsService,
    @Inject('CIRCUIT_BREAKER_FACTORY')
    private readonly cbFactory: CircuitBreakerFactory
  ) {
    // Initialize enhanced HTTP client
    this.httpClient = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'Enterprise-Integration-Service/1.0',
      },
    });

    // Configure circuit breaker for token refresh
    this.tokenRefreshBreaker = this.cbFactory.create('tokenRefresh', {
      timeout: 5000,
      resetTimeout: 30000,
      errorThresholdPercentage: 50,
      volumeThreshold: 10,
    });
  }

  /**
   * Generates secure OAuth2 authorization URL with PKCE support
   */
  public async generateAuthUrl(
    serviceType: ServiceType,
    redirectUri: string,
    state: string
  ): Promise<string> {
    try {
      // Get service configuration
      const configResult = getIntegrationConfig(serviceType);
      if (!configResult.success) {
        throw new Error(`Invalid service configuration: ${configResult.error}`);
      }
      const config = configResult.data;

      // Generate PKCE parameters
      const pkceParams = await this.generatePKCEParams();

      // Store PKCE verifier securely
      await this.tokenMetrics.storePKCEVerifier(state, pkceParams.codeVerifier);

      // Build authorization URL with enhanced security
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: process.env.OAUTH_CLIENT_ID!,
        redirect_uri: redirectUri,
        scope: config.scopes.join(' '),
        state: state,
        code_challenge: pkceParams.codeChallenge,
        code_challenge_method: pkceParams.codeChallengeMethod,
        access_type: 'offline',
        prompt: 'consent',
      });

      this.logger.debug(`Generating auth URL for service: ${serviceType}`);
      return `${config.endpoints.authorizationUrl}?${params.toString()}`;
    } catch (error) {
      this.logger.error(`Auth URL generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Exchanges authorization code for tokens with enhanced security
   */
  public async exchangeCodeForTokens(
    serviceType: ServiceType,
    code: string,
    redirectUri: string,
    state: string
  ): Promise<OAuthTokenResponse> {
    try {
      // Retrieve and validate PKCE verifier
      const codeVerifier = await this.tokenMetrics.retrievePKCEVerifier(state);
      if (!codeVerifier) {
        throw new Error('Invalid or expired PKCE verifier');
      }

      const config = (await getIntegrationConfig(serviceType)).data;
      
      // Exchange code for tokens with PKCE
      const response = await this.httpClient.post<OAuthTokenResponse>(
        config.endpoints.tokenUrl,
        {
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: process.env.OAUTH_CLIENT_ID,
          client_secret: process.env.OAUTH_CLIENT_SECRET,
          code_verifier: codeVerifier,
        },
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      // Enhance token response with metadata
      const tokenResponse = {
        ...response.data,
        issued_at: Date.now(),
      };

      // Update token metrics
      await this.tokenMetrics.recordTokenExchange(serviceType, tokenResponse);

      return tokenResponse;
    } catch (error) {
      this.logger.error(`Token exchange failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Refreshes access token with circuit breaker protection
   */
  public async refreshAccessToken(
    connectionId: string
  ): Promise<OAuthTokenResponse> {
    return this.tokenRefreshBreaker.fire(async () => {
      const connection = await this.connectionRepo.findById(connectionId);
      if (!connection) {
        throw new Error('Connection not found');
      }

      const config = (await getIntegrationConfig(connection.serviceType)).data;

      try {
        const response = await this.httpClient.post<OAuthTokenResponse>(
          config.endpoints.tokenUrl,
          {
            grant_type: 'refresh_token',
            refresh_token: connection.credentials.refreshToken,
            client_id: process.env.OAUTH_CLIENT_ID,
            client_secret: process.env.OAUTH_CLIENT_SECRET,
          },
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          }
        );

        // Update connection with new tokens
        await connection.updateTokenMetrics(response.data);
        await connection.save();

        return {
          ...response.data,
          issued_at: Date.now(),
        };
      } catch (error) {
        await connection.updateStatus(ConnectionStatus.ERROR);
        throw error;
      }
    });
  }

  /**
   * Generates PKCE parameters for enhanced security
   */
  private async generatePKCEParams(): Promise<PKCEParams> {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256')
      .update(verifier)
      .digest('base64url');

    return {
      codeVerifier: verifier,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
    };
  }

  /**
   * Revokes OAuth tokens and updates connection status
   */
  public async revokeTokens(connectionId: string): Promise<void> {
    const connection = await this.connectionRepo.findById(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    const config = (await getIntegrationConfig(connection.serviceType)).data;

    try {
      // Revoke access token
      await this.httpClient.post(config.endpoints.revokeUrl, {
        token: connection.credentials.accessToken,
        client_id: process.env.OAUTH_CLIENT_ID,
        client_secret: process.env.OAUTH_CLIENT_SECRET,
      });

      // Revoke refresh token if present
      if (connection.credentials.refreshToken) {
        await this.httpClient.post(config.endpoints.revokeUrl, {
          token: connection.credentials.refreshToken,
          client_id: process.env.OAUTH_CLIENT_ID,
          client_secret: process.env.OAUTH_CLIENT_SECRET,
        });
      }

      // Update connection status
      await connection.updateStatus(ConnectionStatus.DISCONNECTED);
      await connection.save();

      this.logger.debug(`Tokens revoked for connection: ${connectionId}`);
    } catch (error) {
      this.logger.error(`Token revocation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validates token health and updates metrics
   */
  public async validateTokenHealth(connectionId: string): Promise<boolean> {
    const connection = await this.connectionRepo.findById(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    try {
      await connection.validateCredentials();
      return true;
    } catch (error) {
      this.logger.warn(`Token health check failed: ${error.message}`);
      return false;
    }
  }
}