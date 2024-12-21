/**
 * @fileoverview Redux slice for managing authentication state with enhanced security features
 * including OAuth 2.0, JWT, MFA support, and security monitoring capabilities.
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'; // v1.9.7
import type { AuthState, LoginCredentials, AuthResponse, AuthError, SecurityMetadata } from '../../types/auth.types';
import AuthService from '../../services/auth.service';

// Security configuration constants
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const TOKEN_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Initial state with comprehensive security tracking
const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isMfaRequired: false,
  error: null,
  security: null
};

/**
 * Enhanced async thunk for user login with security monitoring
 */
export const loginThunk = createAsyncThunk<AuthResponse, LoginCredentials, { rejectValue: AuthError }>(
  'auth/login',
  async (credentials: LoginCredentials, { rejectWithValue }) => {
    try {
      const response = await AuthService.login(credentials);
      return response;
    } catch (error: any) {
      return rejectWithValue(error);
    }
  }
);

/**
 * Async thunk for MFA verification with enhanced security
 */
export const verifyMfaThunk = createAsyncThunk<AuthResponse, string, { rejectValue: AuthError }>(
  'auth/verifyMfa',
  async (token: string, { rejectWithValue }) => {
    try {
      const response = await AuthService.verifyMfa(token);
      return response;
    } catch (error: any) {
      return rejectWithValue(error);
    }
  }
);

/**
 * Async thunk for secure token refresh
 */
export const refreshTokenThunk = createAsyncThunk<void, void, { rejectValue: AuthError }>(
  'auth/refreshToken',
  async (_, { rejectWithValue }) => {
    try {
      await AuthService.refreshToken();
    } catch (error: any) {
      return rejectWithValue(error);
    }
  }
);

/**
 * Async thunk for security monitoring and session management
 */
export const monitorSecurityThunk = createAsyncThunk(
  'auth/monitorSecurity',
  async (_, { dispatch }) => {
    await AuthService.monitorSession();
  }
);

/**
 * Enhanced authentication slice with comprehensive security features
 */
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    resetError: (state) => {
      state.error = null;
    },
    clearAuth: (state) => {
      return { ...initialState };
    },
    updateSecurityMetadata: (state, action) => {
      state.security = action.payload;
    }
  },
  extraReducers: (builder) => {
    // Login flow
    builder
      .addCase(loginThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginThunk.fulfilled, (state, action) => {
        if (action.payload.requiresMfa) {
          state.isMfaRequired = true;
          state.isLoading = false;
        } else {
          state.user = action.payload.user;
          state.isAuthenticated = true;
          state.isMfaRequired = false;
          state.security = action.payload.security;
        }
        state.isLoading = false;
        state.error = null;
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || {
          message: 'Authentication failed',
          code: 401
        };
      });

    // MFA verification flow
    builder
      .addCase(verifyMfaThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(verifyMfaThunk.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.isAuthenticated = true;
        state.isMfaRequired = false;
        state.security = action.payload.security;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(verifyMfaThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || {
          message: 'MFA verification failed',
          code: 401
        };
      });

    // Token refresh flow
    builder
      .addCase(refreshTokenThunk.rejected, (state, action) => {
        state.isAuthenticated = false;
        state.user = null;
        state.error = action.payload || {
          message: 'Session expired',
          code: 401
        };
      });

    // Security monitoring flow
    builder
      .addCase(monitorSecurityThunk.fulfilled, (state, action) => {
        if (action.payload) {
          state.security = action.payload as SecurityMetadata;
        }
      });
  }
});

// Export actions
export const { resetError, clearAuth, updateSecurityMetadata } = authSlice.actions;

// Selectors with memoization potential
export const selectAuth = (state: { auth: AuthState }): AuthState => state.auth;
export const selectSecurityStatus = (state: { auth: AuthState }): SecurityMetadata | null => state.auth.security;
export const selectMfaStatus = (state: { auth: AuthState }): boolean => state.auth.isMfaRequired;

// Export reducer
export default authSlice.reducer;