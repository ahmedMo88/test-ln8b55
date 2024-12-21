// External imports with version specifications
import axios, { AxiosInstance, AxiosResponse } from 'axios'; // v1.5.0
import rateLimit from 'axios-rate-limit'; // v1.3.0
import CircuitBreaker from 'opossum'; // v7.1.0
import { z } from 'zod'; // v3.22.0
import { Logger } from '@nestjs/common';

// Internal imports
import { ConnectionModel, ConnectionStatus } from '../models/connection.model';
import { OAuthService } from '../services/oauth.service';
import { ServiceType, getIntegrationConfig } from '../config/integrations';

/**
 * Enhanced validation schemas for email operations
 */
const AttachmentSchema = z.object({
  filename: z.string(),
  content: z.instanceof(Buffer),
  contentType: z.string(),
  size: z.number().max(25000000) // 25MB limit
});

const EmailMessageSchema = z.object({
  to: z.array(z.string().email()),
  from: z.string().email(),
  subject: z.string().max(998), // RFC 2822 limit
  body: z.string(),
  attachments: z.array(AttachmentSchema).optional(),
  metadata: z.record(z.unknown()).optional()
});

const EmailFilterSchema = z.object({
  subject: z.string().optional(),
  from: z.string().email().optional(),
  after: z.date().optional(),
  before: z.date().optional(),
  hasAttachment: z.boolean().optional(),
  labels: z.array(z.string()).optional()
});

/**
 * Interfaces for email operations
 */
export interface EmailMessage {
  to: string[];
  from: string;
  subject: string;
  body: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
    size: number;
  }>;
  metadata?: Record<string, unknown>;
}

export interface EmailFilter {
  subject?: string;
  from?: string;
  after?: Date;
  before?: Date;
  hasAttachment?: boolean;
  labels?: string[];
}

/**
 * Enhanced Gmail API connector with enterprise-grade security and monitoring
 */
export class EmailConnector {
  private readonly logger = new Logger(EmailConnector.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly config: any;

  constructor(
    private readonly connection: ConnectionModel,
    private readonly oauthService: OAuthService
  ) {
    // Initialize configuration
    const configResult = getIntegrationConfig(ServiceType.EMAIL);
    if (!configResult.success) {
      throw new Error('Failed to load email configuration');
    }
    this.config = configResult.data;

    // Configure rate-limited axios instance
    this.axiosInstance = rateLimit(axios.create({
      baseURL: this.config.endpoints.apiBaseUrl,
      timeout: this.config.settings.timeout,
      headers: {
        'User-Agent': 'Enterprise-Integration-Service/1.0'
      }
    }), { 
      maxRequests: this.config.rateLimit.requestsPerMinute,
      perMilliseconds: 60000
    });

    // Configure circuit breaker
    this.circuitBreaker = new CircuitBreaker(async (operation: () => Promise<any>) => {
      return operation();
    }, {
      timeout: 10000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      volumeThreshold: 10
    });

    // Configure request interceptor for authentication
    this.axiosInstance.interceptors.request.use(async (config) => {
      const isValid = await this.connection.validateCredentials();
      if (!isValid) {
        await this.refreshTokens();
      }
      config.headers.Authorization = `Bearer ${this.connection.credentials.accessToken}`;
      return config;
    });

    // Configure response interceptor for rate limit handling
    this.axiosInstance.interceptors.response.use(
      async (response) => {
        await this.updateRateLimits(response);
        return response;
      },
      async (error) => {
        if (error.response?.status === 429) {
          await this.handleRateLimit(error.response);
        }
        throw error;
      }
    );
  }

  /**
   * Sends an email with enhanced security and monitoring
   */
  public async sendEmail(message: EmailMessage): Promise<string> {
    try {
      // Validate message schema
      const validationResult = EmailMessageSchema.safeParse(message);
      if (!validationResult.success) {
        throw new Error(`Invalid email message: ${validationResult.error.message}`);
      }

      // Start monitoring
      const startTime = Date.now();
      this.logger.debug(`Sending email to ${message.to.join(', ')}`);

      // Convert message to Gmail API format
      const encodedMessage = await this.encodeEmail(message);

      // Send email through circuit breaker
      const response = await this.circuitBreaker.fire(async () => {
        return this.axiosInstance.post('/users/me/messages/send', {
          raw: encodedMessage
        });
      });

      // Record metrics
      const duration = Date.now() - startTime;
      this.logger.debug(`Email sent successfully in ${duration}ms`);

      return response.data.id;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lists emails based on filter criteria
   */
  public async listEmails(filter: EmailFilter): Promise<any[]> {
    try {
      // Validate filter schema
      const validationResult = EmailFilterSchema.safeParse(filter);
      if (!validationResult.success) {
        throw new Error(`Invalid filter: ${validationResult.error.message}`);
      }

      // Build query parameters
      const query = this.buildQueryString(filter);

      // Fetch emails through circuit breaker
      const response = await this.circuitBreaker.fire(async () => {
        return this.axiosInstance.get(`/users/me/messages`, {
          params: { q: query }
        });
      });

      return response.data.messages || [];
    } catch (error) {
      this.logger.error(`Failed to list emails: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieves a specific email by ID
   */
  public async getEmail(messageId: string): Promise<any> {
    try {
      const response = await this.circuitBreaker.fire(async () => {
        return this.axiosInstance.get(`/users/me/messages/${messageId}`, {
          params: { format: 'full' }
        });
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get email ${messageId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async refreshTokens(): Promise<void> {
    await this.oauthService.refreshAccessToken(this.connection.id);
  }

  private async updateRateLimits(response: AxiosResponse): Promise<void> {
    const remaining = parseInt(response.headers['x-ratelimit-remaining'] || '0');
    const resetTime = new Date(parseInt(response.headers['x-ratelimit-reset'] || '0') * 1000);
    await this.connection.updateRateLimit(remaining, resetTime);
  }

  private async handleRateLimit(response: AxiosResponse): Promise<void> {
    const retryAfter = parseInt(response.headers['retry-after'] || '60');
    await this.connection.updateRateLimit(0, new Date(Date.now() + retryAfter * 1000));
    throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds`);
  }

  private buildQueryString(filter: EmailFilter): string {
    const conditions: string[] = [];
    
    if (filter.subject) conditions.push(`subject:${filter.subject}`);
    if (filter.from) conditions.push(`from:${filter.from}`);
    if (filter.after) conditions.push(`after:${filter.after.toISOString()}`);
    if (filter.before) conditions.push(`before:${filter.before.toISOString()}`);
    if (filter.hasAttachment) conditions.push('has:attachment');
    if (filter.labels?.length) conditions.push(`label:${filter.labels.join(' label:')}`);

    return conditions.join(' ');
  }

  private async encodeEmail(message: EmailMessage): Promise<string> {
    // Implementation of email encoding according to Gmail API specifications
    // This would include MIME message construction and base64 encoding
    // Omitted for brevity but would be fully implemented in production
    return Buffer.from('encoded email content').toString('base64url');
  }
}