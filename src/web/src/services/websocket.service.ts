/**
 * @fileoverview Production-grade WebSocket service implementation for real-time communication
 * with comprehensive connection management, heartbeat mechanism, and error handling.
 * @version 1.0.0
 */

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { API_ENDPOINTS, BASE_URL } from '../constants/api';
import { WorkflowExecution, ExecutionStatus } from '../types/workflow.types';

// Constants for WebSocket configuration
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const HEARTBEAT_INTERVAL = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;
const MESSAGE_TIMEOUT = 5000;

// Connection state enum
export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  ERROR = 'ERROR'
}

// Interface definitions
interface Message {
  type: string;
  payload: any;
  id: string;
}

interface ConnectionOptions {
  autoReconnect?: boolean;
  heartbeat?: boolean;
  timeout?: number;
}

interface SubscriptionCallbacks {
  onExecution?: (execution: WorkflowExecution) => void;
  onStatus?: (status: ExecutionStatus) => void;
  onError?: (error: Error) => void;
}

/**
 * Production-ready WebSocket service managing real-time communication
 * with comprehensive connection handling and monitoring.
 */
export class WebSocketService {
  private socket: WebSocket | null = null;
  private eventEmitter: EventEmitter;
  private reconnectAttempts: number = 0;
  private reconnectDelay: number = INITIAL_RECONNECT_DELAY;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private subscriptions: Map<string, Set<Function>> = new Map();
  private pendingMessages: Array<Message> = [];
  private messageTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.eventEmitter = new EventEmitter();
    // Increase max listeners to handle multiple subscriptions
    this.eventEmitter.setMaxListeners(50);
  }

  /**
   * Initializes WebSocket connection with authentication and monitoring
   * @param token - Authentication token
   * @param options - Connection configuration options
   */
  public async initialize(
    token: string,
    options: ConnectionOptions = {}
  ): Promise<void> {
    try {
      // Clean up existing connection if any
      await this.cleanup();

      const wsUrl = `${BASE_URL.replace('http', 'ws')}/ws?token=${token}`;
      this.connectionState = ConnectionState.CONNECTING;

      this.socket = new WebSocket(wsUrl);
      this.setupSocketHandlers();

      // Initialize heartbeat if enabled
      if (options.heartbeat !== false) {
        this.initializeHeartbeat();
      }

      await this.waitForConnection();
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  /**
   * Subscribes to workflow execution updates
   * @param workflowId - ID of the workflow to subscribe to
   * @param callbacks - Callback functions for different events
   */
  public async subscribe(
    workflowId: string,
    callbacks: SubscriptionCallbacks
  ): Promise<void> {
    if (this.connectionState !== ConnectionState.CONNECTED) {
      throw new Error('WebSocket not connected');
    }

    const subscriptionMessage: Message = {
      type: 'subscribe',
      payload: { workflowId },
      id: crypto.randomUUID()
    };

    // Register callbacks
    if (callbacks.onExecution) {
      this.eventEmitter.on(`execution:${workflowId}`, callbacks.onExecution);
    }
    if (callbacks.onStatus) {
      this.eventEmitter.on(`status:${workflowId}`, callbacks.onStatus);
    }
    if (callbacks.onError) {
      this.eventEmitter.on(`error:${workflowId}`, callbacks.onError);
    }

    // Send subscription request
    await this.sendMessage(subscriptionMessage);
  }

  /**
   * Unsubscribes from workflow execution updates
   * @param workflowId - ID of the workflow to unsubscribe from
   */
  public async unsubscribe(workflowId: string): Promise<void> {
    const unsubscribeMessage: Message = {
      type: 'unsubscribe',
      payload: { workflowId },
      id: crypto.randomUUID()
    };

    // Remove all listeners for this workflow
    this.eventEmitter.removeAllListeners(`execution:${workflowId}`);
    this.eventEmitter.removeAllListeners(`status:${workflowId}`);
    this.eventEmitter.removeAllListeners(`error:${workflowId}`);

    await this.sendMessage(unsubscribeMessage);
  }

  /**
   * Gets current connection state
   */
  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Disconnects WebSocket connection and cleans up resources
   */
  public async disconnect(): Promise<void> {
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Clear all timeouts
    this.messageTimeouts.forEach(timeout => clearTimeout(timeout));
    this.messageTimeouts.clear();

    this.connectionState = ConnectionState.DISCONNECTED;
    this.eventEmitter.removeAllListeners();
  }

  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.onopen = () => {
      this.connectionState = ConnectionState.CONNECTED;
      this.reconnectAttempts = 0;
      this.reconnectDelay = INITIAL_RECONNECT_DELAY;
      this.processPendingMessages();
    };

    this.socket.onclose = () => {
      this.handleDisconnection();
    };

    this.socket.onerror = (error) => {
      this.handleError(error as Error);
    };

    this.socket.onmessage = (event) => {
      this.handleMessage(event);
    };
  }

  private async handleMessage(event: WebSocket.MessageEvent): Promise<void> {
    try {
      const message = JSON.parse(event.data as string) as Message;
      
      // Clear message timeout if exists
      const timeout = this.messageTimeouts.get(message.id);
      if (timeout) {
        clearTimeout(timeout);
        this.messageTimeouts.delete(message.id);
      }

      switch (message.type) {
        case 'execution':
          this.eventEmitter.emit(
            `execution:${message.payload.workflowId}`,
            message.payload as WorkflowExecution
          );
          break;
        case 'status':
          this.eventEmitter.emit(
            `status:${message.payload.workflowId}`,
            message.payload.status as ExecutionStatus
          );
          break;
        case 'error':
          this.eventEmitter.emit(
            `error:${message.payload.workflowId}`,
            new Error(message.payload.message)
          );
          break;
        case 'pong':
          // Heartbeat response received
          break;
      }
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  private async sendMessage(message: Message): Promise<void> {
    if (this.connectionState !== ConnectionState.CONNECTED) {
      this.pendingMessages.push(message);
      return;
    }

    try {
      this.socket?.send(JSON.stringify(message));

      // Set timeout for message response
      const timeout = setTimeout(() => {
        this.handleMessageTimeout(message);
      }, MESSAGE_TIMEOUT);

      this.messageTimeouts.set(message.id, timeout);
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  private handleMessageTimeout(message: Message): void {
    this.messageTimeouts.delete(message.id);
    this.handleError(new Error(`Message timeout: ${message.type}`));
  }

  private async processPendingMessages(): Promise<void> {
    while (this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift();
      if (message) {
        await this.sendMessage(message);
      }
    }
  }

  private initializeHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendMessage({
        type: 'ping',
        payload: { timestamp: Date.now() },
        id: crypto.randomUUID()
      });
    }, HEARTBEAT_INTERVAL);
  }

  private async handleDisconnection(): Promise<void> {
    this.connectionState = ConnectionState.RECONNECTING;

    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        MAX_RECONNECT_DELAY
      );

      setTimeout(() => {
        this.initialize(
          this.getStoredToken(),
          { autoReconnect: true, heartbeat: true }
        );
      }, this.reconnectDelay);
    } else {
      this.connectionState = ConnectionState.ERROR;
      this.eventEmitter.emit('error', new Error('Max reconnection attempts reached'));
    }
  }

  private handleError(error: Error): void {
    this.connectionState = ConnectionState.ERROR;
    this.eventEmitter.emit('error', error);
  }

  private getStoredToken(): string {
    // Implement token retrieval from secure storage
    return localStorage.getItem('auth_token') || '';
  }

  private async waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, MESSAGE_TIMEOUT);

      this.eventEmitter.once('connected', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();