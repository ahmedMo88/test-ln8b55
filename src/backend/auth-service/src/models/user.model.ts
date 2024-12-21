// External imports with versions
import mongoose, { Schema, Document, Model } from 'mongoose'; // ^7.0.0
import bcrypt from 'bcryptjs'; // ^2.4.3
import speakeasy from 'speakeasy'; // ^2.0.0
import zxcvbn from 'zxcvbn'; // ^4.4.2
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

// Internal imports
import { PasswordPolicy, SecurityConfig } from '../config/auth';

// Security constants
const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 900000; // 15 minutes
const PASSWORD_HISTORY_SIZE = 5;
const MIN_PASSWORD_LENGTH = 12;
const MFA_BACKUP_CODES_COUNT = 10;
const TOKEN_ENCRYPTION_ALGORITHM = 'aes-256-gcm';

// Consent types for GDPR compliance
interface ConsentRecord {
  type: string;
  granted: boolean;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
}

// Audit log entry for security tracking
interface AuditLogEntry {
  action: string;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  details: Record<string, any>;
}

// Enhanced user interface with security and compliance features
export interface IUser extends Document {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roles: string[];
  isActive: boolean;
  isLocked: boolean;
  isMfaEnabled: boolean;
  mfaSecret?: string;
  mfaBackupCodes: string[];
  loginAttempts: number;
  lastLogin?: Date;
  passwordChangedAt?: Date;
  previousPasswords: string[];
  oauthProfiles: Map<string, string>;
  encryptedOAuthTokens: Map<string, string>;
  consentHistory: ConsentRecord[];
  securityAuditLog: AuditLogEntry[];
  dataRetentionPolicy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;

  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateMfaSecret(): Promise<string>;
  validateMfaToken(token: string): boolean;
  incrementLoginAttempts(): Promise<void>;
  resetLoginAttempts(): Promise<void>;
  addAuditLogEntry(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void>;
  addConsentRecord(record: Omit<ConsentRecord, 'timestamp'>): Promise<void>;
  encryptOAuthToken(provider: string, token: string): Promise<void>;
  decryptOAuthToken(provider: string): Promise<string | null>;
}

// Enhanced mongoose schema with security and compliance features
const UserSchema = new Schema<IUser>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  password: {
    type: String,
    required: true,
    minlength: MIN_PASSWORD_LENGTH,
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
  },
  roles: {
    type: [String],
    required: true,
    default: ['user'],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isLocked: {
    type: Boolean,
    default: false,
  },
  isMfaEnabled: {
    type: Boolean,
    default: false,
  },
  mfaSecret: {
    type: String,
    select: false,
  },
  mfaBackupCodes: {
    type: [String],
    select: false,
    default: [],
  },
  loginAttempts: {
    type: Number,
    default: 0,
  },
  lastLogin: Date,
  passwordChangedAt: Date,
  previousPasswords: {
    type: [String],
    select: false,
    default: [],
  },
  oauthProfiles: {
    type: Map,
    of: String,
    default: new Map(),
  },
  encryptedOAuthTokens: {
    type: Map,
    of: String,
    select: false,
    default: new Map(),
  },
  consentHistory: {
    type: [{
      type: { type: String, required: true },
      granted: { type: Boolean, required: true },
      timestamp: { type: Date, required: true },
      ipAddress: { type: String, required: true },
      userAgent: { type: String, required: true },
    }],
    default: [],
  },
  securityAuditLog: {
    type: [{
      action: { type: String, required: true },
      timestamp: { type: Date, required: true },
      ipAddress: { type: String, required: true },
      userAgent: { type: String, required: true },
      details: { type: Schema.Types.Mixed },
    }],
    default: [],
  },
  dataRetentionPolicy: {
    type: String,
    default: 'standard',
  },
}, {
  timestamps: true,
});

// Indexes for performance optimization
UserSchema.index({ email: 1 });
UserSchema.index({ roles: 1 });
UserSchema.index({ createdAt: 1 });
UserSchema.index({ 'securityAuditLog.timestamp': 1 });

// Password hashing middleware
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    // Validate password strength
    const strength = zxcvbn(this.password);
    if (strength.score < 3) {
      throw new Error('Password is too weak');
    }

    // Hash password
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hash = await bcrypt.hash(this.password, salt);

    // Store previous password before updating
    if (this.password) {
      this.previousPasswords = [
        ...this.previousPasswords.slice(-(PASSWORD_HISTORY_SIZE - 1)),
        this.password
      ];
    }

    this.password = hash;
    this.passwordChangedAt = new Date();
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Enhanced password comparison with rate limiting
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  try {
    if (this.isLocked) {
      throw new Error('Account is locked');
    }

    const isMatch = await bcrypt.compare(candidatePassword, this.password);
    
    if (isMatch) {
      await this.resetLoginAttempts();
      return true;
    } else {
      await this.incrementLoginAttempts();
      return false;
    }
  } catch (error) {
    throw error;
  }
};

// MFA methods
UserSchema.methods.generateMfaSecret = async function(): Promise<string> {
  const secret = speakeasy.generateSecret({
    length: 20,
    name: `WorkflowApp:${this.email}`,
  });

  // Generate backup codes
  const backupCodes = Array.from({ length: MFA_BACKUP_CODES_COUNT }, () =>
    randomBytes(4).toString('hex')
  );

  this.mfaSecret = secret.base32;
  this.mfaBackupCodes = backupCodes;
  this.isMfaEnabled = true;

  await this.save();
  return secret.base32;
};

UserSchema.methods.validateMfaToken = function(token: string): boolean {
  return speakeasy.totp.verify({
    secret: this.mfaSecret,
    encoding: 'base32',
    token,
    window: 1,
  });
};

// Login attempt management
UserSchema.methods.incrementLoginAttempts = async function(): Promise<void> {
  this.loginAttempts += 1;
  
  if (this.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
    this.isLocked = true;
    setTimeout(() => {
      this.isLocked = false;
      this.loginAttempts = 0;
      this.save();
    }, LOCK_TIME);
  }
  
  await this.save();
};

UserSchema.methods.resetLoginAttempts = async function(): Promise<void> {
  this.loginAttempts = 0;
  this.isLocked = false;
  await this.save();
};

// Audit and compliance methods
UserSchema.methods.addAuditLogEntry = async function(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
  this.securityAuditLog.push({
    ...entry,
    timestamp: new Date(),
  });
  await this.save();
};

UserSchema.methods.addConsentRecord = async function(record: Omit<ConsentRecord, 'timestamp'>): Promise<void> {
  this.consentHistory.push({
    ...record,
    timestamp: new Date(),
  });
  await this.save();
};

// OAuth token encryption methods
UserSchema.methods.encryptOAuthToken = async function(provider: string, token: string): Promise<void> {
  const iv = randomBytes(16);
  const key = randomBytes(32);
  const cipher = createCipheriv(TOKEN_ENCRYPTION_ALGORITHM, key, iv);
  
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  this.encryptedOAuthTokens.set(provider, `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}:${key.toString('hex')}`);
  await this.save();
};

UserSchema.methods.decryptOAuthToken = async function(provider: string): Promise<string | null> {
  const encryptedData = this.encryptedOAuthTokens.get(provider);
  if (!encryptedData) return null;

  const [ivHex, encrypted, authTagHex, keyHex] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = Buffer.from(keyHex, 'hex');

  const decipher = createDecipheriv(TOKEN_ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

// Create and export the model
const User: Model<IUser> = mongoose.model<IUser>('User', UserSchema);
export default User;