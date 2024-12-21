/**
 * @fileoverview Root Redux store configuration with real-time WebSocket support,
 * middleware configuration, and TypeScript integration.
 * @version 1.0.0
 */

import { configureStore, Middleware } from '@reduxjs/toolkit'; // v1.9.7
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux'; // v8.1.0
import logger from 'redux-logger'; // v4.1.0

// Import reducers from feature slices
import authReducer from './slices/authSlice';
import integrationReducer from './slices/integrationSlice';
import uiReducer from './slices/uiSlice';
import workflowReducer from './slices/workflowSlice';

// WebSocket middleware configuration
const WS_RECONNECT_INTERVAL = 3000;
const WS_PING_INTERVAL = 30000;

/**
 * Custom WebSocket middleware for real-time updates
 */
const createWebSocketMiddleware = (): Middleware => {
  let ws: WebSocket | null = null;
  let reconnectTimeout: NodeJS.Timeout | null = null;
  let pingInterval: NodeJS.Timeout | null = null;

  const connectWebSocket = (store: any) => {
    const wsUrl = `${process.env.REACT_APP_WS_URL || 'ws://localhost:8080'}/ws`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.info('WebSocket connected');
      store.dispatch({ type: 'ws/connected' });

      // Setup ping interval
      pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, WS_PING_INTERVAL);
    };

    ws.onclose = () => {
      console.warn('WebSocket disconnected');
      store.dispatch({ type: 'ws/disconnected' });
      scheduleReconnect(store);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      store.dispatch({ type: 'ws/error', payload: error });
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        // Handle different message types
        switch (message.type) {
          case 'workflow_execution_update':
            store.dispatch({
              type: 'workflow/updateExecutionStatus',
              payload: message.data
            });
            break;
          case 'integration_status_update':
            store.dispatch({
              type: 'integration/updateHealthStatus',
              payload: message.data
            });
            break;
          case 'auth_session_expired':
            store.dispatch({ type: 'auth/clearAuth' });
            break;
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };
  };

  const scheduleReconnect = (store: any) => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    if (pingInterval) {
      clearInterval(pingInterval);
    }
    reconnectTimeout = setTimeout(() => {
      connectWebSocket(store);
    }, WS_RECONNECT_INTERVAL);
  };

  return store => next => action => {
    // Handle WebSocket-specific actions
    if (action.type === 'ws/connect' && !ws) {
      connectWebSocket(store);
    }
    if (action.type === 'ws/disconnect' && ws) {
      ws.close();
      ws = null;
    }
    return next(action);
  };
};

/**
 * Configure Redux store with all middleware and enhancers
 */
export const store = configureStore({
  reducer: {
    auth: authReducer,
    integration: integrationReducer,
    ui: uiReducer,
    workflow: workflowReducer
  },
  middleware: (getDefaultMiddleware) => {
    const middleware = getDefaultMiddleware({
      serializableCheck: {
        // Ignore non-serializable values in specific action types
        ignoredActions: ['ws/error', 'auth/login/fulfilled'],
        // Ignore non-serializable values in specific paths
        ignoredPaths: ['workflow.executions']
      },
      thunk: {
        extraArgument: undefined
      }
    });

    // Add WebSocket middleware
    middleware.push(createWebSocketMiddleware());

    // Add logger in development
    if (process.env.NODE_ENV === 'development') {
      middleware.push(logger);
    }

    return middleware;
  },
  devTools: process.env.NODE_ENV !== 'production',
  preloadedState: undefined,
  enhancers: []
});

// Export types for TypeScript support
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Export typed hooks for use in components
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Initialize WebSocket connection
store.dispatch({ type: 'ws/connect' });

// Export store as default
export default store;