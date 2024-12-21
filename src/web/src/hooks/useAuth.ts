/**
 * @fileoverview Enhanced authentication hook implementing OAuth 2.0 + JWT authentication
 * with comprehensive security features including MFA support, token security,
 * and security monitoring.
 * @version 1.0.0
 */

import { useEffect, useCallback, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  loginThunk, 
  verifyMfaThunk, 
  refreshTokenThunk,
  monitorSecurityThunk,
  selectAuth,
  selectSecurityStatus,
  selectMfaStatus,
  clearAuth
} from '../store/slices/authSlice';
import type { 
  User, 
  AuthError, 
  LoginCredentials,
  SecurityMetadata,
  MfaMethod
} from '../types/auth.types';
import { isTokenValid, getToken, removeToken } from '../utils/auth';

// Security configuration constants
const SESSION_CHECK_INTERVAL = 60 * 1000; // 1 minute
const SECURITY_MONITOR_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MAX_SESSION_DURATION = 12 * 60 * 60 * 1000; // 12 hours

/**
 * MFA status enum for tracking multi-factor authentication state
 */
enum MfaStatus {
  NONE = 'NONE',
  REQUIRED = 'REQUIRED',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED'
}

/**
 * Enhanced authentication hook with comprehensive security features
 * @returns Authentication state and operations interface
 */
export const useAuth = () => {
  const dispatch = useDispatch();
  const auth = useSelector(selectAuth);
  const securityStatus = useSelector(selectSecurityStatus);
  const mfaRequired = useSelector(selectMfaStatus);

  // Internal state management
  const [mfaStatus, setMfaStatus] = useState<MfaStatus>(MfaStatus.NONE);
  const [sessionStartTime] = useState<number>(Date.now());
  const securityCheckInterval = useRef<NodeJS.Timeout>();
  const sessionCheckInterval = useRef<NodeJS.Timeout>();

  /**
   * Enhanced login function with security validation and MFA support
   */
  const login = useCallback(async (credentials: LoginCredentials) => {
    try {
      const result = await dispatch(loginThunk(credentials)).unwrap();
      
      if (result.requiresMfa) {
        setMfaStatus(MfaStatus.REQUIRED);
      } else {
        setMfaStatus(MfaStatus.NONE);
      }

      return result;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }, [dispatch]);

  /**
   * Verify MFA token during authentication process
   */
  const verifyMfa = useCallback(async (token: string) => {
    try {
      const result = await dispatch(verifyMfaThunk(token)).unwrap();
      setMfaStatus(MfaStatus.VERIFIED);
      return result;
    } catch (error) {
      setMfaStatus(MfaStatus.FAILED);
      console.error('MFA verification failed:', error);
      throw error;
    }
  }, [dispatch]);

  /**
   * Setup MFA for current user with specified method
   */
  const setupMfa = useCallback(async (method: MfaMethod) => {
    try {
      // Implementation would call auth service to setup MFA
      // Placeholder for actual implementation
      console.log('Setting up MFA with method:', method);
    } catch (error) {
      console.error('MFA setup failed:', error);
      throw error;
    }
  }, []);

  /**
   * Secure logout with cleanup and security monitoring
   */
  const logout = useCallback(async () => {
    try {
      dispatch(clearAuth());
      removeToken();
      clearSecurityIntervals();
      setMfaStatus(MfaStatus.NONE);
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  }, [dispatch]);

  /**
   * Validate current session with security checks
   */
  const validateSession = useCallback((): boolean => {
    // Check token validity
    if (!isTokenValid()) {
      logout();
      return false;
    }

    // Check session duration
    const sessionDuration = Date.now() - sessionStartTime;
    if (sessionDuration > MAX_SESSION_DURATION) {
      logout();
      return false;
    }

    return true;
  }, [logout, sessionStartTime]);

  /**
   * Refresh authentication token with security validation
   */
  const refreshToken = useCallback(async () => {
    try {
      await dispatch(refreshTokenThunk()).unwrap();
    } catch (error) {
      console.error('Token refresh failed:', error);
      logout();
      throw error;
    }
  }, [dispatch, logout]);

  /**
   * Get current security status with comprehensive metadata
   */
  const getSecurityStatus = useCallback((): SecurityMetadata | null => {
    return securityStatus;
  }, [securityStatus]);

  /**
   * Clear security monitoring intervals
   */
  const clearSecurityIntervals = useCallback(() => {
    if (securityCheckInterval.current) {
      clearInterval(securityCheckInterval.current);
    }
    if (sessionCheckInterval.current) {
      clearInterval(sessionCheckInterval.current);
    }
  }, []);

  /**
   * Setup security monitoring and session validation
   */
  useEffect(() => {
    if (auth.isAuthenticated) {
      // Setup security monitoring
      securityCheckInterval.current = setInterval(() => {
        dispatch(monitorSecurityThunk());
      }, SECURITY_MONITOR_INTERVAL);

      // Setup session validation
      sessionCheckInterval.current = setInterval(() => {
        validateSession();
      }, SESSION_CHECK_INTERVAL);

      // Initial security check
      dispatch(monitorSecurityThunk());
    }

    return () => clearSecurityIntervals();
  }, [auth.isAuthenticated, dispatch, validateSession, clearSecurityIntervals]);

  // Return enhanced authentication interface
  return {
    user: auth.user,
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    error: auth.error,
    mfaStatus,
    login,
    verifyMfa,
    setupMfa,
    logout,
    refreshToken,
    validateSession,
    getSecurityStatus
  };
};

// Type definitions for hook return value
export interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: AuthError | null;
  mfaStatus: MfaStatus;
  login: (credentials: LoginCredentials) => Promise<void>;
  verifyMfa: (token: string) => Promise<void>;
  setupMfa: (method: MfaMethod) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  validateSession: () => boolean;
  getSecurityStatus: () => SecurityMetadata | null;
}

export default useAuth;