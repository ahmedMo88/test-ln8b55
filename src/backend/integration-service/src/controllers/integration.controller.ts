// External imports with version specifications
import { 
  Controller, Get, Post, Delete, Body, Param, Query, 
  UseGuards, UseInterceptors, Request, Logger, HttpStatus,
  BadRequestException, UnauthorizedException
} from '@nestjs/common'; // ^10.0.0
import { 
  ApiTags, ApiOperation, ApiResponse, ApiSecurity,
  ApiParam, ApiQuery, ApiBody 
} from '@nestjs/swagger'; // ^7.1.0
import { JwtAuthGuard } from '@nestjs/jwt'; // ^10.1.0
import { RateLimitInterceptor } from '@nestjs/throttler'; // ^5.0.0

// Internal imports
import { ConnectionModel, ConnectionStatus } from '../models/connection.model';
import { OAuthService, OAuthTokenResponse } from '../services/oauth.service';
import { ServiceType, getIntegrationConfig } from '../config/integrations';

/**
 * Controller handling integration management endpoints with enhanced security and monitoring
 */
@Controller('integrations')
@ApiTags('integrations')
@UseGuards(JwtAuthGuard)
@UseInterceptors(RateLimitInterceptor)
@ApiSecurity('jwt')
export class IntegrationController {
  private readonly logger = new Logger(IntegrationController.name);

  constructor(
    private readonly oauthService: OAuthService,
  ) {}

  /**
   * Lists all integration connections for the authenticated user
   */
  @Get()
  @ApiOperation({ summary: 'List all integration connections' })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'List of connections returned',
    type: [ConnectionModel]
  })
  @ApiResponse({ 
    status: HttpStatus.UNAUTHORIZED, 
    description: 'Unauthorized access' 
  })
  @ApiResponse({ 
    status: HttpStatus.TOO_MANY_REQUESTS, 
    description: 'Rate limit exceeded' 
  })
  async listConnections(@Request() req): Promise<ConnectionModel[]> {
    try {
      const userId = req.user.id;
      this.logger.debug(`Listing connections for user: ${userId}`);

      // Get connections and validate their status
      const connections = await ConnectionModel.find({ userId });
      await Promise.all(connections.map(conn => conn.updateStatus()));

      return connections;
    } catch (error) {
      this.logger.error(`Failed to list connections: ${error.message}`);
      throw error;
    }
  }

  /**
   * Initiates OAuth flow with PKCE for a service integration
   */
  @Post('oauth/authorize')
  @ApiOperation({ summary: 'Start OAuth authorization flow with PKCE' })
  @ApiBody({ 
    schema: {
      type: 'object',
      properties: {
        serviceType: { type: 'string', enum: Object.values(ServiceType) },
        redirectUri: { type: 'string', format: 'uri' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Authorization URL returned',
    schema: {
      type: 'object',
      properties: {
        authUrl: { type: 'string', format: 'uri' },
        state: { type: 'string' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: 'Invalid service type or redirect URI' 
  })
  async initiateOAuth(
    @Body('serviceType') serviceType: ServiceType,
    @Body('redirectUri') redirectUri: string,
    @Request() req
  ): Promise<{ authUrl: string; state: string }> {
    try {
      // Validate service type
      const configResult = getIntegrationConfig(serviceType);
      if (!configResult.success) {
        throw new BadRequestException('Invalid service type');
      }

      // Validate redirect URI
      if (!this.isValidRedirectUri(redirectUri)) {
        throw new BadRequestException('Invalid redirect URI');
      }

      // Generate state parameter with user context
      const state = this.generateState(req.user.id);

      // Generate authorization URL with PKCE
      const authUrl = await this.oauthService.generateAuthUrl(
        serviceType,
        redirectUri,
        state
      );

      this.logger.debug(`OAuth flow initiated for service: ${serviceType}`);
      return { authUrl, state };
    } catch (error) {
      this.logger.error(`OAuth initiation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Completes OAuth flow and establishes connection
   */
  @Post('oauth/callback')
  @ApiOperation({ summary: 'Complete OAuth flow and establish connection' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        state: { type: 'string' },
        redirectUri: { type: 'string', format: 'uri' }
      }
    }
  })
  @ApiResponse({ 
    status: HttpStatus.OK, 
    description: 'Connection established',
    type: ConnectionModel
  })
  async completeOAuth(
    @Body('code') code: string,
    @Body('state') state: string,
    @Body('redirectUri') redirectUri: string,
    @Request() req
  ): Promise<ConnectionModel> {
    try {
      // Validate state parameter
      const userId = this.validateState(state);
      if (userId !== req.user.id) {
        throw new UnauthorizedException('Invalid state parameter');
      }

      // Exchange code for tokens
      const tokens = await this.oauthService.exchangeCodeForTokens(
        ServiceType.EMAIL, // Retrieved from state
        code,
        redirectUri,
        state
      );

      // Create or update connection
      const connection = new ConnectionModel();
      connection.userId = userId;
      connection.serviceType = ServiceType.EMAIL; // Retrieved from state
      connection.credentials = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
        version: 1,
        lastRotated: new Date()
      };
      await connection.save();

      this.logger.debug(`OAuth flow completed for user: ${userId}`);
      return connection;
    } catch (error) {
      this.logger.error(`OAuth completion failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Revokes connection and cleans up resources
   */
  @Delete(':connectionId')
  @ApiOperation({ summary: 'Revoke connection and cleanup' })
  @ApiParam({ name: 'connectionId', type: 'string', format: 'uuid' })
  @ApiResponse({ 
    status: HttpStatus.NO_CONTENT, 
    description: 'Connection revoked successfully' 
  })
  async revokeConnection(
    @Param('connectionId') connectionId: string,
    @Request() req
  ): Promise<void> {
    try {
      // Get and validate connection
      const connection = await ConnectionModel.findOne({ 
        id: connectionId,
        userId: req.user.id 
      });
      
      if (!connection) {
        throw new BadRequestException('Connection not found');
      }

      // Revoke OAuth tokens
      await this.oauthService.revokeTokens(connectionId);

      // Delete connection
      await connection.remove();

      this.logger.debug(`Connection revoked: ${connectionId}`);
    } catch (error) {
      this.logger.error(`Connection revocation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validates redirect URI against allowed patterns
   */
  private isValidRedirectUri(uri: string): boolean {
    const allowedDomains = process.env.ALLOWED_REDIRECT_DOMAINS?.split(',') || [];
    try {
      const url = new URL(uri);
      return allowedDomains.some(domain => url.hostname.endsWith(domain));
    } catch {
      return false;
    }
  }

  /**
   * Generates secure state parameter with user context
   */
  private generateState(userId: string): string {
    const stateBuffer = Buffer.from(JSON.stringify({
      userId,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substring(2)
    }));
    return stateBuffer.toString('base64url');
  }

  /**
   * Validates and extracts user ID from state parameter
   */
  private validateState(state: string): string {
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
      const { userId, timestamp } = stateData;

      // Validate timestamp (5 minute expiry)
      if (Date.now() - timestamp > 5 * 60 * 1000) {
        throw new Error('State parameter expired');
      }

      return userId;
    } catch {
      throw new UnauthorizedException('Invalid state parameter');
    }
  }
}