/**
 * @fileoverview Redux slice for managing external service integration state
 * Implements comprehensive integration management with security, monitoring and rate limiting
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'; // v1.9.7
import { 
  Integration, 
  ServiceType, 
  ConnectionStatus,
  IntegrationConfig
} from '../../types/integration.types';
import IntegrationService from '../../services/integration.service';

// Constants
const SLICE_NAME = 'integration';
const HEALTH_CHECK_INTERVAL = 300000; // 5 minutes
const RATE_LIMIT_THRESHOLD = 0.8; // 80% of rate limit

/**
 * Interface for rate limit monitoring
 */
interface RateLimitInfo {
  current: number;
  limit: number;
  resetTime: Date;
  isThrottled: boolean;
}

/**
 * Interface for integration error details
 */
interface IntegrationError {
  code: string;
  message: string;
  serviceType?: ServiceType;
  timestamp: Date;
}

/**
 * Interface for integration slice state
 */
interface IntegrationState {
  integrations: Integration[];
  loading: boolean;
  error: IntegrationError | null;
  selectedIntegration: Integration | null;
  healthStatus: Record<string, ConnectionStatus>;
  rateLimits: Record<string, RateLimitInfo>;
}

// Initial state
const initialState: IntegrationState = {
  integrations: [],
  loading: false,
  error: null,
  selectedIntegration: null,
  healthStatus: {},
  rateLimits: {}
};

/**
 * Async thunk for fetching all integrations with health checks
 */
export const fetchIntegrations = createAsyncThunk(
  `${SLICE_NAME}/fetchIntegrations`,
  async (_, { rejectWithValue }) => {
    try {
      const integrationService = new IntegrationService();
      const integrations = await integrationService.listIntegrations();
      
      // Perform health checks for each integration
      const healthPromises = integrations.map(async (integration) => {
        const status = await integrationService.getIntegrationStatus(integration.id);
        return { id: integration.id, status };
      });
      
      const healthStatuses = await Promise.all(healthPromises);
      const healthMap = healthStatuses.reduce((acc, { id, status }) => ({
        ...acc,
        [id]: status
      }), {});

      return { integrations, healthMap };
    } catch (error) {
      return rejectWithValue({
        code: 'FETCH_ERROR',
        message: 'Failed to fetch integrations',
        timestamp: new Date()
      });
    }
  }
);

/**
 * Async thunk for connecting new integration
 */
export const connectIntegration = createAsyncThunk(
  `${SLICE_NAME}/connectIntegration`,
  async (config: IntegrationConfig, { rejectWithValue }) => {
    try {
      const integrationService = new IntegrationService();
      const integration = await integrationService.connectService(config);
      return integration;
    } catch (error) {
      return rejectWithValue({
        code: 'CONNECTION_ERROR',
        message: 'Failed to connect integration',
        serviceType: config.serviceType,
        timestamp: new Date()
      });
    }
  }
);

/**
 * Async thunk for disconnecting integration
 */
export const disconnectIntegration = createAsyncThunk(
  `${SLICE_NAME}/disconnectIntegration`,
  async (integrationId: string, { rejectWithValue }) => {
    try {
      const integrationService = new IntegrationService();
      await integrationService.disconnectService(integrationId);
      return integrationId;
    } catch (error) {
      return rejectWithValue({
        code: 'DISCONNECT_ERROR',
        message: 'Failed to disconnect integration',
        timestamp: new Date()
      });
    }
  }
);

/**
 * Async thunk for refreshing integration connection
 */
export const refreshIntegration = createAsyncThunk(
  `${SLICE_NAME}/refreshIntegration`,
  async (integrationId: string, { rejectWithValue }) => {
    try {
      const integrationService = new IntegrationService();
      const integration = await integrationService.refreshConnection(integrationId);
      return integration;
    } catch (error) {
      return rejectWithValue({
        code: 'REFRESH_ERROR',
        message: 'Failed to refresh integration',
        timestamp: new Date()
      });
    }
  }
);

/**
 * Integration slice with reducers and actions
 */
const integrationSlice = createSlice({
  name: SLICE_NAME,
  initialState,
  reducers: {
    setSelectedIntegration: (state, action: PayloadAction<Integration | null>) => {
      state.selectedIntegration = action.payload;
    },
    updateHealthStatus: (state, action: PayloadAction<{ id: string; status: ConnectionStatus }>) => {
      state.healthStatus[action.payload.id] = action.payload.status;
    },
    updateRateLimit: (state, action: PayloadAction<{ id: string; info: RateLimitInfo }>) => {
      state.rateLimits[action.payload.id] = action.payload.info;
    },
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    // Fetch integrations
    builder.addCase(fetchIntegrations.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(fetchIntegrations.fulfilled, (state, action) => {
      state.loading = false;
      state.integrations = action.payload.integrations;
      state.healthStatus = action.payload.healthMap;
    });
    builder.addCase(fetchIntegrations.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as IntegrationError;
    });

    // Connect integration
    builder.addCase(connectIntegration.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(connectIntegration.fulfilled, (state, action) => {
      state.loading = false;
      state.integrations.push(action.payload);
      state.healthStatus[action.payload.id] = ConnectionStatus.CONNECTED;
    });
    builder.addCase(connectIntegration.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as IntegrationError;
    });

    // Disconnect integration
    builder.addCase(disconnectIntegration.fulfilled, (state, action) => {
      state.integrations = state.integrations.filter(i => i.id !== action.payload);
      delete state.healthStatus[action.payload];
      delete state.rateLimits[action.payload];
      if (state.selectedIntegration?.id === action.payload) {
        state.selectedIntegration = null;
      }
    });

    // Refresh integration
    builder.addCase(refreshIntegration.fulfilled, (state, action) => {
      const index = state.integrations.findIndex(i => i.id === action.payload.id);
      if (index !== -1) {
        state.integrations[index] = action.payload;
        state.healthStatus[action.payload.id] = ConnectionStatus.CONNECTED;
      }
    });
  }
});

// Export actions
export const {
  setSelectedIntegration,
  updateHealthStatus,
  updateRateLimit,
  clearError
} = integrationSlice.actions;

// Selectors
export const selectIntegrationsByType = (state: { integration: IntegrationState }, type: ServiceType) =>
  state.integration.integrations.filter(i => i.serviceType === type);

export const selectIntegrationHealth = (state: { integration: IntegrationState }, id: string) =>
  state.integration.healthStatus[id];

export const selectIntegrationRateLimits = (state: { integration: IntegrationState }, id: string) =>
  state.integration.rateLimits[id];

// Export reducer
export default integrationSlice.reducer;