/**
 * @file Authentication utility functions
 * @description Implements secure token management and validation for OAuth 2.0 + JWT authentication
 * with enhanced security features and comprehensive validation
 * @version 1.0.0
 */

import { AuthResponse } from '../types/auth.types';
import jwtDecode from 'jwt-decode'; // v3.1.2
import CryptoJS from 'crypto-js'; // v4.1.1

// Storage keys with unique prefixes to prevent naming conflicts
const ACCESS_TOKEN_KEY = 'auth_v1_access_token';
const REFRESH_TOKEN_KEY = 'auth_v1_refresh_token';
const TOKEN_EXPIRY_KEY = 'auth_v1_token_expiry';
const TOKEN_FINGERPRINT_KEY = 'auth_v1_token_fingerprint';
const ENCRYPTION_KEY = process.env.REACT_APP_TOKEN_ENCRYPTION_KEY || 'secure_storage_key';

/**
 * Generates a unique token fingerprint for validation
 * @param token - The token to generate fingerprint for
 * @returns Token fingerprint hash
 */
const generateTokenFingerprint = (token: string): string => {
  const userAgent = window.navigator.userAgent;
  const timestamp = new Date().getTime();
  return CryptoJS.SHA256(`${token}${userAgent}${timestamp}`).toString();
};

/**
 * Encrypts sensitive data before storage
 * @param data - Data to encrypt
 * @returns Encrypted data string
 */
const encryptData = (data: string): string => {
  return CryptoJS.AES.encrypt(data, ENCRYPTION_KEY).toString();
};

/**
 * Decrypts stored encrypted data
 * @param encryptedData - Data to decrypt
 * @returns Decrypted data string or null if invalid
 */
const decryptData = (encryptedData: string): string | null => {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Token decryption failed:', error);
    return null;
  }
};

/**
 * Securely stores authentication tokens with encryption and validation
 * @param authResponse - Authentication response containing tokens
 */
export const setToken = (authResponse: AuthResponse): void => {
  try {
    // Validate input
    if (!authResponse?.accessToken || !authResponse?.refreshToken) {
      throw new Error('Invalid token data');
    }

    // Encrypt tokens
    const encryptedAccessToken = encryptData(authResponse.accessToken);
    const encryptedRefreshToken = encryptData(authResponse.refreshToken);

    // Generate and store token fingerprint
    const fingerprint = generateTokenFingerprint(authResponse.accessToken);

    // Calculate absolute expiration time
    const expiryTime = new Date().getTime() + (authResponse.expiresIn * 1000);

    // Store encrypted tokens and metadata
    localStorage.setItem(ACCESS_TOKEN_KEY, encryptedAccessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, encryptedRefreshToken);
    localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
    localStorage.setItem(TOKEN_FINGERPRINT_KEY, fingerprint);
  } catch (error) {
    console.error('Error storing tokens:', error);
    removeToken(); // Clear potentially corrupted data
  }
};

/**
 * Retrieves and validates the stored access token
 * @returns Decrypted access token if valid, null otherwise
 */
export const getToken = (): string | null => {
  try {
    const encryptedToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!encryptedToken) return null;

    // Validate token fingerprint
    const storedFingerprint = localStorage.getItem(TOKEN_FINGERPRINT_KEY);
    const decryptedToken = decryptData(encryptedToken);
    
    if (!decryptedToken || !storedFingerprint) return null;
    
    const currentFingerprint = generateTokenFingerprint(decryptedToken);
    if (currentFingerprint !== storedFingerprint) {
      console.warn('Token fingerprint mismatch detected');
      removeToken();
      return null;
    }

    return decryptedToken;
  } catch (error) {
    console.error('Error retrieving token:', error);
    return null;
  }
};

/**
 * Retrieves and validates the stored refresh token
 * @returns Decrypted refresh token if valid, null otherwise
 */
export const getRefreshToken = (): string | null => {
  try {
    const encryptedToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    return encryptedToken ? decryptData(encryptedToken) : null;
  } catch (error) {
    console.error('Error retrieving refresh token:', error);
    return null;
  }
};

/**
 * Securely removes all authentication data from storage
 */
export const removeToken = (): void => {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    localStorage.removeItem(TOKEN_FINGERPRINT_KEY);
  } catch (error) {
    console.error('Error removing tokens:', error);
  }
};

/**
 * Comprehensive token validation with multiple security checks
 * @returns boolean indicating if token is valid
 */
export const isTokenValid = (): boolean => {
  try {
    // Check if token exists
    const token = getToken();
    if (!token) return false;

    // Validate expiration
    const expiryTime = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!expiryTime || new Date().getTime() > parseInt(expiryTime)) {
      removeToken();
      return false;
    }

    // Validate token structure and claims
    const payload = getTokenPayload(token);
    if (!payload || !payload.sub || !payload.exp) {
      removeToken();
      return false;
    }

    return true;
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
};

/**
 * Securely decodes and validates JWT token payload
 * @param token - JWT token to decode
 * @returns Decoded token payload or null if invalid
 */
export const getTokenPayload = (token: string): any | null => {
  try {
    // Validate token format
    if (!token || !token.includes('.')) {
      throw new Error('Invalid token format');
    }

    // Decode and validate payload
    const payload = jwtDecode(token);
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid token payload');
    }

    return payload;
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
};

/**
 * Validates token expiration with safety margin
 * @param expirationTime - Token expiration timestamp
 * @returns boolean indicating if token is expired
 */
const isTokenExpired = (expirationTime: number): boolean => {
  const currentTime = Math.floor(Date.now() / 1000);
  const safetyMargin = 60; // 1 minute safety margin
  return currentTime >= (expirationTime - safetyMargin);
};