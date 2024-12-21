/**
 * @fileoverview Enhanced custom React hook for managing theme mode with comprehensive error handling,
 * accessibility support, performance optimizations, and proper TypeScript types.
 * @version 1.0.0
 */

import { useEffect, useCallback } from 'react'; // v18.2.0
import { useDispatch, useSelector } from 'react-redux'; // v8.1.0
import { useMediaQuery } from '@mui/material'; // v5.14.0
import { THEME_MODE } from '../constants/theme';
import createAppTheme from '../theme';
import { setThemeMode } from '../store/slices/uiSlice';

// Constants for theme management
const THEME_STORAGE_KEY = 'theme-mode' as const;
const THEME_CHANGE_EVENT = 'theme-change' as const;
const THEME_ERROR_EVENT = 'theme-error' as const;

/**
 * Interface for theme hook return value with proper TypeScript types
 */
interface UseThemeReturn {
  theme: ReturnType<typeof createAppTheme>;
  themeMode: typeof THEME_MODE[keyof typeof THEME_MODE];
  toggleTheme: () => void;
  isDarkMode: boolean;
}

/**
 * Enhanced custom hook for managing theme mode with comprehensive error handling,
 * accessibility support, and performance optimizations.
 * 
 * Features:
 * - System theme preference detection
 * - Theme persistence in localStorage
 * - Proper error handling and reporting
 * - Accessibility attributes management
 * - Performance optimized with useCallback
 * - Type-safe implementation
 * 
 * @returns {UseThemeReturn} Theme utilities and current state
 */
export const useTheme = (): UseThemeReturn => {
  // Initialize Redux hooks with error boundary protection
  const dispatch = useDispatch();
  const themeMode = useSelector((state: { ui: { themeMode: string } }) => {
    try {
      return state.ui.themeMode;
    } catch (error) {
      console.error('Error accessing theme state:', error);
      return THEME_MODE.LIGHT; // Fallback to light theme
    }
  });

  // System theme preference detection with proper cleanup
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)', {
    noSsr: true, // Disable server-side rendering for this query
  });

  /**
   * Safely access localStorage with error handling
   * @param key Storage key
   * @returns Stored value or null
   */
  const safeGetStorageItem = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error('Error accessing localStorage:', error);
      window.dispatchEvent(new CustomEvent(THEME_ERROR_EVENT, {
        detail: { error, operation: 'read' }
      }));
      return null;
    }
  };

  /**
   * Safely set localStorage with error handling
   * @param key Storage key
   * @param value Value to store
   */
  const safeSetStorageItem = (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error('Error setting localStorage:', error);
      window.dispatchEvent(new CustomEvent(THEME_ERROR_EVENT, {
        detail: { error, operation: 'write' }
      }));
    }
  };

  /**
   * Update document theme-related attributes
   * @param mode Theme mode to apply
   */
  const updateDocumentAttributes = (mode: string): void => {
    try {
      document.documentElement.setAttribute('data-theme', mode);
      document.documentElement.style.colorScheme = mode;
      document.documentElement.setAttribute('aria-theme', mode);
    } catch (error) {
      console.error('Error updating document attributes:', error);
    }
  };

  // Initialize theme based on stored preference or system preference
  useEffect(() => {
    const initializeTheme = (): void => {
      try {
        const storedTheme = safeGetStorageItem(THEME_STORAGE_KEY);
        const initialTheme = storedTheme || (prefersDarkMode ? THEME_MODE.DARK : THEME_MODE.LIGHT);
        
        if (initialTheme !== themeMode) {
          dispatch(setThemeMode(initialTheme));
          updateDocumentAttributes(initialTheme);
        }
      } catch (error) {
        console.error('Error initializing theme:', error);
        // Fallback to light theme on error
        dispatch(setThemeMode(THEME_MODE.LIGHT));
        updateDocumentAttributes(THEME_MODE.LIGHT);
      }
    };

    initializeTheme();
  }, [dispatch, prefersDarkMode, themeMode]);

  // System theme preference change handler
  useEffect(() => {
    const handleSystemThemeChange = (): void => {
      try {
        const storedTheme = safeGetStorageItem(THEME_STORAGE_KEY);
        if (!storedTheme) {
          const newTheme = prefersDarkMode ? THEME_MODE.DARK : THEME_MODE.LIGHT;
          dispatch(setThemeMode(newTheme));
          updateDocumentAttributes(newTheme);
        }
      } catch (error) {
        console.error('Error handling system theme change:', error);
      }
    };

    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', handleSystemThemeChange);

    return () => {
      window.matchMedia('(prefers-color-scheme: dark)')
        .removeEventListener('change', handleSystemThemeChange);
    };
  }, [dispatch, prefersDarkMode]);

  // Memoized theme toggle function
  const toggleTheme = useCallback((): void => {
    try {
      const newTheme = themeMode === THEME_MODE.LIGHT ? THEME_MODE.DARK : THEME_MODE.LIGHT;
      
      // Update Redux state
      dispatch(setThemeMode(newTheme));
      
      // Persist preference
      safeSetStorageItem(THEME_STORAGE_KEY, newTheme);
      
      // Update document attributes
      updateDocumentAttributes(newTheme);
      
      // Emit theme change event for analytics
      window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, {
        detail: { theme: newTheme }
      }));
    } catch (error) {
      console.error('Error toggling theme:', error);
      window.dispatchEvent(new CustomEvent(THEME_ERROR_EVENT, {
        detail: { error, operation: 'toggle' }
      }));
    }
  }, [dispatch, themeMode]);

  // Create memoized theme instance
  const theme = useCallback(() => {
    try {
      return createAppTheme(themeMode);
    } catch (error) {
      console.error('Error creating theme:', error);
      return createAppTheme(THEME_MODE.LIGHT); // Fallback theme
    }
  }, [themeMode])();

  // Return theme utilities with proper TypeScript types
  return {
    theme,
    themeMode,
    toggleTheme,
    isDarkMode: themeMode === THEME_MODE.DARK
  };
};

// Default export for the hook
export default useTheme;