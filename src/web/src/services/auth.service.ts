/**
 * @fileoverview Enhanced authentication service implementing OAuth 2.0 + JWT authentication
 * with comprehensive security features including MFA support, token security,
 * and security monitoring.
 * @version 1.0.0
 */

import CryptoJS from 'crypto-js'; // v4.2.0
import ApiService from './api';
import { API_ENDPOINTS } from '../constants/api';
import AuthUtils from '../utils/auth';
import {
  AuthResponse,
  LoginCredentials,
  AuthError,
  MfaMethod,
  SecurityMetadata,
  User,
  SecurityAlert
} from '../types/auth.types';

// Security configuration constants
const SECURITY_CONFIG = {
  TOKEN_REFRESH_INTERVAL: 4 * 60 * 1000, // 4 minutes
  MAX_LOGIN_ATTEMPTS: 5,
  MFA_TIMEOUT: 5 * 60 * 1000, // 5 minutes
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  DEVICE_VERIFICATION_REQUIRED: true,
  PASSWORD_STRENGTH_REQUIRED: true
};

/**
 * Enhanced authentication service with comprehensive security features
 */
export class AuthService {
  private apiService: typeof ApiService;
  private authUtils: typeof AuthUtils;
  private tokenRefreshInterval: NodeJS.Timeout | null = null;
  private securityMonitorInterval: NodeJS.Timeout | null = null;
  private loginAttempts: Map<string, number> = new Map();
  private mfaSessions: Map<string, Date> = new Map();

  constructor() {
    this.apiService = ApiService;
    this.authUtils = AuthUtils;
    this.setupSecurityMonitoring();
    
    // Configure API security settings
    this.apiService.setRateLimit(API_ENDPOINTS.AUTH, 20);
    this.apiService.setCircuitBreaker(API_ENDPOINTS.AUTH, {
      failureThreshold: 5,
      resetTimeout: 30000
    });
  }

  /**
   * Enhanced user authentication with progressive security measures
   * @param credentials - User login credentials
   * @returns Authentication response with security metadata
   */
  public async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      // Validate login attempts
      this.validateLoginAttempts(credentials.email);

      // Generate device fingerprint for verification
      const deviceFingerprint = await this.authUtils.generateFingerprint();
      
      // Encrypt sensitive data
      const encryptedCredentials = {
        email: credentials.email,
        password: this.authUtils.encryptToken(credentials.password),
        deviceId: deviceFingerprint,
        mfaToken: credentials.mfaToken
      };

      // Perform authentication request
      const response = await this.apiService.post<AuthResponse>(
        API_ENDPOINTS.AUTH.LOGIN,
        encryptedCredentials
      );

      // Handle successful authentication
      if (response.accessToken) {
        this.handleSuccessfulLogin(response);
        return response;
      }

      // Handle MFA requirement
      if (response.requiresMfa) {
        this.initiateMfaSession(credentials.email);
        return response;
      }

      throw new Error('Invalid authentication response');
    } catch (error) {
      this.handleLoginError(credentials.email, error as AuthError);
      throw error;
    }
  }

  /**
   * Enhanced MFA setup with multiple authentication options
   * @param type - Type of MFA to setup
   * @returns MFA setup response with configuration
   */
  public async setupMfa(type: MfaMethod): Promise<any> {
    try {
      // Validate current authentication
      if (!this.authUtils.isTokenValid()) {
        throw new Error('Authentication required for MFA setup');
      }

      const response = await this.apiService.post(
        API_ENDPOINTS.AUTH.MFA_SETUP,
        { type }
      );

      // Store encrypted MFA secret
      if (response.secret) {
        const encryptedSecret = this.authUtils.encryptToken(response.secret);
        localStorage.setItem('mfa_secret', encryptedSecret);
      }

      return response;
    } catch (error) {
      console.error('MFA setup failed:', error);
      throw error;
    }
  }

  /**
   * Verifies MFA token during authentication
   * @param token - MFA verification token
   * @returns Updated authentication response
   */
  public async verifyMfa(token: string): Promise<AuthResponse> {
    try {
      const response = await this.apiService.post<AuthResponse>(
        API_ENDPOINTS.AUTH.MFA_VERIFY,
        { token }
      );

      if (response.accessToken) {
        this.handleSuccessfulLogin(response);
      }

      return response;
    } catch (error) {
      console.error('MFA verification failed:', error);
      throw error;
    }
  }

  /**
   * Refreshes authentication tokens with security validation
   * @returns New authentication tokens
   */
  public async refreshToken(): Promise<AuthResponse> {
    try {
      const refreshToken = this.authUtils.decryptToken(
        localStorage.getItem('refresh_token') || ''
      );

      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await this.apiService.post<AuthResponse>(
        API_ENDPOINTS.AUTH.REFRESH_TOKEN,
        { refreshToken }
      );

      this.handleSuccessfulLogin(response);
      return response;
    } catch (error) {
      this.handleTokenRefreshError(error as AuthError);
      throw error;
    }
  }

  /**
   * Securely logs out user and cleans up security state
   */
  public async logout(): Promise<void> {
    try {
      await this.apiService.post(API_ENDPOINTS.AUTH.LOGOUT);
    } finally {
      this.cleanupSecurityState();
    }
  }

  /**
   * Revokes specific authentication token
   * @param token - Token to revoke
   */
  public async revokeToken(token: string): Promise<void> {
    await this.apiService.post(API_ENDPOINTS.AUTH.LOGOUT, { token });
  }

  /**
   * Private helper methods
   */

  private validateLoginAttempts(email: string): void {
    const attempts = this.loginAttempts.get(email) || 0;
    if (attempts >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
      throw new Error('Account temporarily locked due to multiple failed attempts');
    }
  }

  private handleSuccessfulLogin(response: AuthResponse): void {
    // Reset security state
    this.loginAttempts.delete(response.user.email);
    this.mfaSessions.delete(response.user.email);

    // Setup token refresh
    this.setupTokenRefresh();

    // Store encrypted tokens
    this.storeAuthTokens(response);

    // Update security metadata
    this.updateSecurityMetadata(response.security);
  }

  private handleLoginError(email: string, error: AuthError): void {
    const attempts = (this.loginAttempts.get(email) || 0) + 1;
    this.loginAttempts.set(email, attempts);

    if (attempts >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
      this.triggerSecurityAlert({
        type: 'account_locked',
        message: 'Account locked due to multiple failed attempts',
        email
      });
    }
  }

  private setupTokenRefresh(): void {
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
    }

    this.tokenRefreshInterval = setInterval(
      () => this.refreshToken(),
      SECURITY_CONFIG.TOKEN_REFRESH_INTERVAL
    );
  }

  private setupSecurityMonitoring(): void {
    this.securityMonitorInterval = setInterval(
      () => this.monitorSecurityState(),
      60000 // Check every minute
    );
  }

  private storeAuthTokens(response: AuthResponse): void {
    const encryptedAccess = this.authUtils.encryptToken(response.accessToken);
    const encryptedRefresh = this.authUtils.encryptToken(response.refreshToken);

    localStorage.setItem('access_token', encryptedAccess);
    localStorage.setItem('refresh_token', encryptedRefresh);
  }

  private cleanupSecurityState(): void {
    localStorage.clear();
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
    }
    if (this.securityMonitorInterval) {
      clearInterval(this.securityMonitorInterval);
    }
  }

  private async monitorSecurityState(): Promise<void> {
    try {
      const token = this.authUtils.decryptToken(
        localStorage.getItem('access_token') || ''
      );

      if (token) {
        const securityStatus = await this.apiService.get(
          API_ENDPOINTS.AUTH.CURRENT_USER
        );
        this.updateSecurityMetadata(securityStatus.security);
      }
    } catch (error) {
      console.error('Security monitoring error:', error);
    }
  }

  private updateSecurityMetadata(metadata: SecurityMetadata): void {
    localStorage.setItem('security_metadata', JSON.stringify(metadata));
    this.processSecurityAlerts(metadata.activeAlerts);
  }

  private processSecurityAlerts(alerts: SecurityAlert[]): void {
    alerts.forEach(alert => {
      this.triggerSecurityAlert(alert);
    });
  }

  private triggerSecurityAlert(alert: SecurityAlert): void {
    // Implement security alert handling (e.g., notify security team, log event)
    console.warn('Security Alert:', alert);
  }
}

// Export singleton instance
export const authService = new AuthService();
export default authService;