// External dependencies with versions
import axios from 'axios'; // ^1.6.0
import querystring from 'querystring'; // latest
import winston from 'winston'; // ^3.11.0
import { RateLimiterRedis } from 'rate-limiter-flexible'; // ^3.0.0
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';

// Internal imports
import { providers } from '../config/auth';
import User from '../models/user.model';
import { jwtService } from './jwt.service';

// Constants
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.OAUTH_ENCRYPTION_KEY || randomBytes(32);
const STATE_TIMEOUT = 600000; // 10 minutes
const MAX_RETRIES = 3;
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100;

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'oauth-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'oauth-combined.log' })
  ]
});

// Configure rate limiter
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  points: RATE_LIMIT_MAX,
  duration: RATE_LIMIT_WINDOW,
  blockDuration: 900000 // 15 minutes
});

/**
 * Interface for normalized OAuth user profile
 */
interface OAuthProfile {
  provider: string;
  providerId: string;
  email: string;
  firstName: string;
  lastName: string;
  picture: string;
  raw: Record<string, any>;
  lastVerified: Date;
  emailVerified: boolean;
  permissions: string[];
}

/**
 * Interface for OAuth tokens with encryption metadata
 */
interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  encryptionVersion: string;
  issuedAt: Date;
  scope: string;
}

/**
 * OAuth service implementation with enhanced security features
 */
class OAuthService {
  private stateStore: Map<string, { timestamp: number; nonce: string }> = new Map();

  /**
   * Generate OAuth provider authorization URL with enhanced security
   */
  async generateAuthUrl(
    provider: string,
    state: string,
    options: { scope?: string[]; redirectUri?: string }
  ): Promise<string> {
    try {
      // Rate limit check
      await rateLimiter.consume(provider);

      // Validate provider
      const providerConfig = providers[provider];
      if (!providerConfig) {
        throw new Error(`Unsupported OAuth provider: ${provider}`);
      }

      // Generate and store state with nonce
      const nonce = randomBytes(16).toString('hex');
      this.stateStore.set(state, {
        timestamp: Date.now(),
        nonce
      });

      // Clean up expired states
      this.cleanupExpiredStates();

      // Build authorization parameters
      const params = {
        client_id: providerConfig.clientId,
        redirect_uri: options.redirectUri || providerConfig.callbackUrl,
        response_type: 'code',
        scope: (options.scope || providerConfig.scope).join(' '),
        state,
        nonce,
        access_type: 'offline',
        prompt: 'consent'
      };

      logger.info('Generated OAuth authorization URL', {
        provider,
        redirectUri: params.redirect_uri
      });

      return `${providerConfig.authorizationURL}?${querystring.stringify(params)}`;
    } catch (error) {
      logger.error('Error generating OAuth URL', {
        provider,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Exchange authorization code for tokens with retry and encryption
   */
  async exchangeCodeForTokens(
    provider: string,
    code: string,
    options: { state: string; redirectUri?: string }
  ): Promise<OAuthTokens> {
    try {
      // Validate state and nonce
      const stateData = this.stateStore.get(options.state);
      if (!stateData) {
        throw new Error('Invalid or expired state parameter');
      }
      this.stateStore.delete(options.state);

      const providerConfig = providers[provider];
      let retryCount = 0;

      while (retryCount < MAX_RETRIES) {
        try {
          const response = await axios.post(
            providerConfig.tokenURL,
            querystring.stringify({
              grant_type: 'authorization_code',
              code,
              client_id: providerConfig.clientId,
              client_secret: providerConfig.clientSecret,
              redirect_uri: options.redirectUri || providerConfig.callbackUrl
            }),
            {
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              timeout: providerConfig.timeoutMs
            }
          );

          // Encrypt sensitive token data
          const encryptedTokens = this.encryptTokens(response.data);

          logger.info('Successfully exchanged code for tokens', {
            provider,
            tokenType: response.data.token_type
          });

          return {
            accessToken: encryptedTokens.accessToken,
            refreshToken: encryptedTokens.refreshToken,
            expiresIn: response.data.expires_in,
            tokenType: response.data.token_type,
            encryptionVersion: '1',
            issuedAt: new Date(),
            scope: response.data.scope
          };
        } catch (error) {
          retryCount++;
          if (retryCount === MAX_RETRIES) {
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    } catch (error) {
      logger.error('Error exchanging code for tokens', {
        provider,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle OAuth callback and user profile creation/update
   */
  async handleCallback(
    provider: string,
    code: string,
    options: { state: string; redirectUri?: string }
  ): Promise<{ user: any; tokens: any }> {
    try {
      const tokens = await this.exchangeCodeForTokens(provider, code, options);
      const profile = await this.fetchUserProfile(provider, tokens.accessToken);

      // Find or create user
      let user = await User.findOne({ email: profile.email });
      
      if (!user) {
        user = await User.create({
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          roles: ['user'],
          oauthProfiles: new Map([[provider, profile.providerId]])
        });
      }

      // Update OAuth profile and tokens
      await user.encryptOAuthToken(provider, tokens.accessToken);
      user.oauthProfiles.set(provider, profile.providerId);
      await user.save();

      // Generate JWT tokens
      const jwtTokens = await jwtService.generateTokens(user, {
        userAgent: options.userAgent,
        ip: options.ip,
        deviceId: randomBytes(16).toString('hex')
      });

      logger.info('Successfully handled OAuth callback', {
        provider,
        userId: user.id
      });

      return { user, tokens: jwtTokens };
    } catch (error) {
      logger.error('Error handling OAuth callback', {
        provider,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Revoke OAuth tokens
   */
  async revokeTokens(provider: string, userId: string): Promise<void> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const token = await user.decryptOAuthToken(provider);
      if (!token) {
        throw new Error('No token found for provider');
      }

      const providerConfig = providers[provider];
      await axios.post(
        providerConfig.revokeURL,
        querystring.stringify({ token }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      user.oauthProfiles.delete(provider);
      user.encryptedOAuthTokens.delete(provider);
      await user.save();

      logger.info('Successfully revoked OAuth tokens', {
        provider,
        userId
      });
    } catch (error) {
      logger.error('Error revoking OAuth tokens', {
        provider,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  // Private helper methods
  private encryptTokens(tokens: any): { accessToken: string; refreshToken: string } {
    const iv = randomBytes(16);
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, ENCRYPTION_KEY, iv);
    
    const encryptToken = (token: string): string => {
      const encrypted = Buffer.concat([
        cipher.update(token, 'utf8'),
        cipher.final()
      ]);
      const authTag = cipher.getAuthTag();
      return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
    };

    return {
      accessToken: encryptToken(tokens.access_token),
      refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null
    };
  }

  private cleanupExpiredStates(): void {
    const now = Date.now();
    for (const [state, data] of this.stateStore.entries()) {
      if (now - data.timestamp > STATE_TIMEOUT) {
        this.stateStore.delete(state);
      }
    }
  }
}

// Export service instance
export const oauthService = new OAuthService();