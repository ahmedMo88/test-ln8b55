// External imports - Versions specified for enterprise dependency management
import { z } from 'zod'; // v3.22.2
import { 
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, 
  UpdateDateColumn, Index, BeforeUpdate, AfterLoad 
} from 'typeorm'; // v0.3.17
import { Encrypted } from '@company/encryption'; // v1.0.0

// Internal imports
import { ServiceType, AuthType } from '../config/integrations';

// Event emitter for connection status changes
import { EventEmitter } from 'events';
const connectionEvents = new EventEmitter();

/**
 * Enum defining possible connection statuses with enhanced monitoring support
 */
export enum ConnectionStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  EXPIRED = 'EXPIRED',
  ERROR = 'ERROR',
  RATE_LIMITED = 'RATE_LIMITED'
}

/**
 * Zod schema for runtime validation of connection credentials
 */
const ConnectionCredentialsSchema = z.object({
  accessToken: z.string().min(1).max(2048).optional(),
  refreshToken: z.string().min(1).max(2048).optional(),
  expiresAt: z.date().optional(),
  apiKey: z.string().min(16).max(512).optional(),
  version: z.number().min(1),
  lastRotated: z.date()
});

/**
 * Interface defining the structure of connection credentials with enhanced security
 */
export interface ConnectionCredentials {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  apiKey?: string;
  version: number;
  lastRotated: Date;
}

/**
 * Entity class representing a service integration connection with enterprise-grade security
 */
@Entity('connections')
@Index(['userId', 'serviceType'])
export class ConnectionModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: ServiceType })
  serviceType: ServiceType;

  @Column({ type: 'enum', enum: AuthType })
  authType: AuthType;

  @Column('jsonb')
  @Encrypted()
  credentials: ConnectionCredentials;

  @Column({ type: 'enum', enum: ConnectionStatus })
  status: ConnectionStatus;

  @Column({ type: 'int', default: 0 })
  rateLimitRemaining: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  rateLimitReset: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastUsed: Date;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;

  @Column({ type: 'int', default: 0 })
  failedValidationAttempts: number;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  /**
   * Updates connection status based on current state with comprehensive validation
   */
  async updateStatus(): Promise<void> {
    const previousStatus = this.status;
    
    // Check rate limiting status
    if (this.rateLimitReset && this.rateLimitReset > new Date()) {
      this.status = ConnectionStatus.RATE_LIMITED;
    }
    // Check credential expiration
    else if (this.credentials.expiresAt && this.credentials.expiresAt < new Date()) {
      this.status = ConnectionStatus.EXPIRED;
    }
    // Check failed validation attempts
    else if (this.failedValidationAttempts >= 3) {
      this.status = ConnectionStatus.ERROR;
    }
    // Reset to connected if all checks pass
    else {
      this.status = ConnectionStatus.CONNECTED;
      this.failedValidationAttempts = 0;
    }

    // Emit status change event if status changed
    if (previousStatus !== this.status) {
      connectionEvents.emit('connectionStatusChanged', {
        connectionId: this.id,
        previousStatus,
        newStatus: this.status,
        timestamp: new Date()
      });
    }
  }

  /**
   * Validates connection credentials with enhanced security checks
   */
  async validateCredentials(): Promise<boolean> {
    try {
      // Validate credential structure
      const validationResult = ConnectionCredentialsSchema.safeParse(this.credentials);
      if (!validationResult.success) {
        throw new Error('Invalid credential structure');
      }

      // Check credential version and rotation
      const rotationThreshold = new Date();
      rotationThreshold.setDate(rotationThreshold.getDate() - 90); // 90-day rotation policy
      
      if (this.credentials.lastRotated < rotationThreshold) {
        throw new Error('Credentials require rotation');
      }

      // Auth type specific validation
      switch (this.authType) {
        case AuthType.OAUTH2:
          if (!this.credentials.accessToken || !this.credentials.refreshToken) {
            throw new Error('Missing OAuth2 credentials');
          }
          break;
        case AuthType.API_KEY:
          if (!this.credentials.apiKey) {
            throw new Error('Missing API key');
          }
          break;
      }

      this.lastUsed = new Date();
      return true;
    } catch (error) {
      this.failedValidationAttempts++;
      await this.updateStatus();
      
      // Log validation failure
      console.error('Credential validation failed:', {
        connectionId: this.id,
        serviceType: this.serviceType,
        error: error.message,
        timestamp: new Date()
      });
      
      return false;
    }
  }

  /**
   * Updates rate limit information with enhanced monitoring
   */
  async updateRateLimit(remaining: number, resetTime: Date): Promise<void> {
    const previousRemaining = this.rateLimitRemaining;
    
    this.rateLimitRemaining = remaining;
    this.rateLimitReset = resetTime;

    // Check for rate limit threshold (20% remaining)
    if (remaining <= 20 && previousRemaining > 20) {
      connectionEvents.emit('rateLimitWarning', {
        connectionId: this.id,
        serviceType: this.serviceType,
        remaining,
        resetTime,
        timestamp: new Date()
      });
    }

    await this.updateStatus();
  }

  /**
   * Lifecycle hook to validate credentials before updates
   */
  @BeforeUpdate()
  async beforeUpdate(): Promise<void> {
    await this.validateCredentials();
  }

  /**
   * Lifecycle hook to check status after loading
   */
  @AfterLoad()
  async afterLoad(): Promise<void> {
    await this.updateStatus();
  }
}

// Export connection events for external monitoring
export const CONNECTION_EVENTS = connectionEvents;