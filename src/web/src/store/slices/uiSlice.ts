/**
 * @fileoverview Redux slice for managing global UI state including theme mode, 
 * sidebar state, notifications, and loading states with persistence and validation.
 * @version 1.0.0
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit'; // v1.9.7
import { THEME_MODE } from '../../constants/theme';

// Constants
const NOTIFICATION_TIMEOUT = 5000;
const MAX_NOTIFICATIONS = 5;
const STORAGE_KEYS = {
  THEME: 'app_theme_mode',
  SIDEBAR: 'app_sidebar_state'
} as const;

/**
 * Interface for notification items in the queue
 */
interface NotificationItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  timestamp: number;
  autoClose?: boolean;
}

/**
 * Payload type for showing notifications
 */
interface NotificationPayload {
  type: NotificationItem['type'];
  message: string;
  autoClose?: boolean;
}

/**
 * Interface defining the UI state structure
 */
export interface UIState {
  themeMode: string;
  isSidebarOpen: boolean;
  isLoading: boolean;
  notifications: NotificationItem[];
}

/**
 * Initial state with default values
 * Attempts to restore persisted preferences
 */
const initialState: UIState = {
  themeMode: (() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.THEME);
      return stored && [THEME_MODE.LIGHT, THEME_MODE.DARK].includes(stored)
        ? stored
        : THEME_MODE.LIGHT;
    } catch {
      return THEME_MODE.LIGHT;
    }
  })(),
  isSidebarOpen: (() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.SIDEBAR) !== 'false';
    } catch {
      return true;
    }
  })(),
  isLoading: false,
  notifications: []
};

/**
 * UI slice containing reducers for theme, sidebar, loading, and notification management
 */
export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    /**
     * Updates and persists the theme mode
     * @param state Current UI state
     * @param action Payload containing theme mode
     */
    setThemeMode: (state, action: PayloadAction<string>) => {
      const newTheme = action.payload;
      
      // Validate theme mode
      if (![THEME_MODE.LIGHT, THEME_MODE.DARK].includes(newTheme)) {
        console.error(`Invalid theme mode: ${newTheme}`);
        return;
      }

      try {
        // Update state
        state.themeMode = newTheme;
        
        // Persist preference
        localStorage.setItem(STORAGE_KEYS.THEME, newTheme);
        
        // Update document attributes
        document.documentElement.setAttribute('data-theme', newTheme);
        document.documentElement.style.colorScheme = newTheme;
        
        // Dispatch theme change event for analytics
        window.dispatchEvent(new CustomEvent('themeChange', { 
          detail: { theme: newTheme } 
        }));
      } catch (error) {
        console.error('Error updating theme mode:', error);
      }
    },

    /**
     * Toggles and persists the sidebar state
     * @param state Current UI state
     */
    toggleSidebar: (state) => {
      try {
        // Toggle state
        state.isSidebarOpen = !state.isSidebarOpen;
        
        // Persist preference
        localStorage.setItem(STORAGE_KEYS.SIDEBAR, String(state.isSidebarOpen));
        
        // Update accessibility attributes
        const sidebar = document.getElementById('app-sidebar');
        if (sidebar) {
          sidebar.setAttribute('aria-expanded', String(state.isSidebarOpen));
        }
      } catch (error) {
        console.error('Error toggling sidebar:', error);
      }
    },

    /**
     * Updates global loading state
     * @param state Current UI state
     * @param action Payload containing loading state
     */
    setLoading: (state, action: PayloadAction<boolean>) => {
      try {
        state.isLoading = action.payload;
        
        // Update accessibility attributes
        document.body.setAttribute('aria-busy', String(action.payload));
      } catch (error) {
        console.error('Error updating loading state:', error);
      }
    },

    /**
     * Shows a notification with queue management
     * @param state Current UI state
     * @param action Payload containing notification data
     */
    showNotification: (state, action: PayloadAction<NotificationPayload>) => {
      try {
        const { type, message, autoClose = true } = action.payload;
        
        // Validate message
        if (!message.trim()) {
          console.error('Empty notification message');
          return;
        }

        // Create notification item
        const notification: NotificationItem = {
          id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type,
          message: message.trim(),
          timestamp: Date.now(),
          autoClose
        };

        // Manage queue size
        if (state.notifications.length >= MAX_NOTIFICATIONS) {
          state.notifications.shift();
        }

        // Add notification
        state.notifications.push(notification);

        // Update aria-live region
        const alertRegion = document.getElementById('notification-live-region');
        if (alertRegion) {
          alertRegion.textContent = message;
        }
      } catch (error) {
        console.error('Error showing notification:', error);
      }
    },

    /**
     * Dismisses a notification by ID
     * @param state Current UI state
     * @param action Payload containing notification ID
     */
    dismissNotification: (state, action: PayloadAction<string>) => {
      try {
        state.notifications = state.notifications.filter(
          notification => notification.id !== action.payload
        );
      } catch (error) {
        console.error('Error dismissing notification:', error);
      }
    }
  }
});

// Export actions and reducer
export const { 
  setThemeMode, 
  toggleSidebar, 
  setLoading, 
  showNotification, 
  dismissNotification 
} = uiSlice.actions;

export default uiSlice.reducer;