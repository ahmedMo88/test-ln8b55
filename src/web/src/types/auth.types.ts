/**
 * @file Authentication type definitions
 * @description Defines TypeScript interfaces and types for implementing OAuth 2.0 + JWT authentication
 * with role-based access control, MFA support, and comprehensive security features.
 * @version 1.0.0
 */

/**
 * Available user roles in the system with corresponding access levels
 */
export type UserRole = 'admin' | 'team_lead' | 'developer' | 'analyst' | 'viewer';

/**
 * Standard authentication error codes aligned with HTTP status codes
 */
export type AuthErrorCode = 401 | 403 | 404 | 422 | 429 | 500;

/**
 * Types of security alerts that can be triggered in the system
 */
export type SecurityAlertType = 
  | 'suspicious_login' 
  | 'password_expiry' 
  | 'account_locked' 
  | 'mfa_disabled' 
  | 'role_changed';

/**
 * Supported multi-factor authentication methods
 */
export type MfaMethod = 'totp' | 'sms' | 'email' | 'backup_codes';

/**
 * Comprehensive user data structure with security and audit fields
 */
export interface User {
  readonly id: string;
  email: string;
  firstName: string;
  lastName: string;
  readonly roles: UserRole[];
  isActive: boolean;
  isMfaEnabled: boolean;
  mfaSecret?: string;
  lastLogin: Date;
  lastPasswordChange: Date;
  failedLoginAttempts: number;
  accountLockoutUntil: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  authVersion: string;
}

/**
 * Login credentials with MFA support and device management
 */
export interface LoginCredentials {
  email: string;
  password: string;
  mfaToken?: string;
  deviceId?: string;
  rememberDevice?: boolean;
}

/**
 * User registration data with security options
 */
export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  isMfaEnabled?: boolean;
  inviteCode?: string;
  acceptedTerms: boolean;
}

/**
 * Authentication response with security metadata and tokens
 */
export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  requiresMfa: boolean;
  isNewDevice: boolean;
  deviceToken?: string;
  security: SecurityMetadata;
}

/**
 * Security-related metadata for enhanced monitoring
 */
export interface SecurityMetadata {
  lastLoginIp: string;
  lastLoginLocation: string;
  lastLoginDevice: string;
  passwordExpiryWarning: boolean;
  daysUntilPasswordExpiry: number;
  activeAlerts: SecurityAlert[];
}

/**
 * Security alert structure for user notifications
 */
export interface SecurityAlert {
  id: string;
  type: SecurityAlertType;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

/**
 * Authentication state for frontend state management
 */
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isMfaRequired: boolean;
  error: AuthError | null;
  security: SecurityMetadata | null;
}

/**
 * Detailed authentication error structure
 */
export interface AuthError {
  message: string;
  code: AuthErrorCode;
  field?: string;
  action?: string;
  metadata?: any;
}

/**
 * MFA setup response with configuration details
 */
export interface MfaSetupResponse {
  secret: string;
  qrCode: string;
  backupCodes: string;
  validityPeriod: number;
  availableMethods: MfaMethod[];
}