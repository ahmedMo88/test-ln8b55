/**
 * @fileoverview Advanced React hook for managing secure WebSocket connections with
 * automatic reconnection, message encryption, and comprehensive error handling.
 * @version 1.0.0
 */

import { useState, useEffect, useCallback } from 'react';
import { WebSocketService } from '../services/websocket.service';
import { WorkflowExecution } from '../types/workflow.types';
import { useAuth } from './useAuth';

// Connection states for WebSocket lifecycle management
export enum WebSocketConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  ERROR = 'ERROR'
}

// Interface for WebSocket errors with enhanced details
export interface WebSocketError {
  code: string;
  message: string;
  timestamp: Date;
  attempts?: number;
  originalError?: Error;
}

// Interface for message queue management
export interface MessageQueue {
  pending: number;
  processed: number;
  failed: number;
  lastProcessed?: Date;
}

// Interface for connection metrics
export interface ConnectionMetrics {
  latency: number;
  uptime: number;
  reconnections: number;
  lastReconnect?: Date;
  messageStats: {
    sent: number;
    received: number;
    failed: number;
  };
}

// Interface for WebSocket hook options
export interface WebSocketOptions {
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  messageTimeout?: number;
  batchSize?: number;
}

// Default configuration values
const DEFAULT_OPTIONS: Required<WebSocketOptions> = {
  autoReconnect: true,
  maxReconnectAttempts: 5,
  reconnectInterval: 5000,
  heartbeatInterval: 30000,
  messageTimeout: 5000,
  batchSize: 100
};

/**
 * Advanced custom hook for managing secure WebSocket connections with comprehensive
 * error handling and monitoring capabilities.
 * 
 * @param workflowId - Optional workflow ID to subscribe to specific execution updates
 * @param options - Configuration options for WebSocket behavior
 * @returns WebSocket state and monitoring interface
 */
export const useWebSocket = (
  workflowId?: string,
  options: WebSocketOptions = {}
) => {
  // Merge provided options with defaults
  const config = { ...DEFAULT_OPTIONS, ...options };

  // State management
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>(
    WebSocketConnectionState.DISCONNECTED
  );
  const [execution, setExecution] = useState<WorkflowExecution | null>(null);
  const [error, setError] = useState<WebSocketError | null>(null);
  const [messageQueue, setMessageQueue] = useState<MessageQueue>({
    pending: 0,
    processed: 0,
    failed: 0
  });
  const [metrics, setMetrics] = useState<ConnectionMetrics>({
    latency: 0,
    uptime: 0,
    reconnections: 0,
    messageStats: {
      sent: 0,
      received: 0,
      failed: 0
    }
  });

  // Get authentication state
  const { isAuthenticated, getToken } = useAuth();

  /**
   * Initializes WebSocket connection with security measures
   */
  const initializeConnection = useCallback(async () => {
    try {
      if (!isAuthenticated) {
        throw new Error('Authentication required for WebSocket connection');
      }

      const token = getToken();
      if (!token) {
        throw new Error('Valid token required for WebSocket connection');
      }

      setConnectionState(WebSocketConnectionState.CONNECTING);

      await WebSocketService.initialize(token, {
        autoReconnect: config.autoReconnect,
        heartbeat: true,
        timeout: config.messageTimeout
      });

      setConnectionState(WebSocketConnectionState.CONNECTED);
      updateMetrics({ reconnections: metrics.reconnections + 1 });

    } catch (error) {
      handleError(error as Error);
    }
  }, [isAuthenticated, getToken, config, metrics.reconnections]);

  /**
   * Handles WebSocket errors with comprehensive error tracking
   */
  const handleError = useCallback((error: Error): void => {
    const wsError: WebSocketError = {
      code: 'WS_ERROR',
      message: error.message,
      timestamp: new Date(),
      originalError: error
    };

    setError(wsError);
    setConnectionState(WebSocketConnectionState.ERROR);
    updateMetrics({
      messageStats: {
        ...metrics.messageStats,
        failed: metrics.messageStats.failed + 1
      }
    });
  }, [metrics.messageStats.failed]);

  /**
   * Updates connection metrics
   */
  const updateMetrics = useCallback((newMetrics: Partial<ConnectionMetrics>) => {
    setMetrics(current => ({
      ...current,
      ...newMetrics,
      lastReconnect: new Date()
    }));
  }, []);

  /**
   * Subscribes to workflow execution updates
   */
  const subscribeToWorkflow = useCallback(async () => {
    if (!workflowId || connectionState !== WebSocketConnectionState.CONNECTED) {
      return;
    }

    try {
      await WebSocketService.subscribe(workflowId, {
        onExecution: (data: WorkflowExecution) => {
          setExecution(data);
          updateMetrics({
            messageStats: {
              ...metrics.messageStats,
              received: metrics.messageStats.received + 1
            }
          });
        },
        onError: (error: Error) => handleError(error)
      });

      updateMetrics({
        messageStats: {
          ...metrics.messageStats,
          sent: metrics.messageStats.sent + 1
        }
      });
    } catch (error) {
      handleError(error as Error);
    }
  }, [workflowId, connectionState, handleError, metrics.messageStats, updateMetrics]);

  /**
   * Cleanup WebSocket resources
   */
  const cleanup = useCallback(async () => {
    try {
      if (workflowId) {
        await WebSocketService.unsubscribe(workflowId);
      }
      await WebSocketService.disconnect();
      setConnectionState(WebSocketConnectionState.DISCONNECTED);
      setExecution(null);
    } catch (error) {
      handleError(error as Error);
    }
  }, [workflowId, handleError]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (isAuthenticated) {
      initializeConnection();
    }
    return () => {
      cleanup();
    };
  }, [isAuthenticated, initializeConnection, cleanup]);

  // Subscribe to workflow updates when connected
  useEffect(() => {
    if (connectionState === WebSocketConnectionState.CONNECTED && workflowId) {
      subscribeToWorkflow();
    }
  }, [connectionState, workflowId, subscribeToWorkflow]);

  // Return enhanced WebSocket interface
  return {
    isConnected: connectionState === WebSocketConnectionState.CONNECTED,
    execution,
    error,
    connectionState,
    messageQueue,
    metrics
  };
};

export default useWebSocket;