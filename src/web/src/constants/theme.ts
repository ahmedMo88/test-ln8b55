/**
 * @fileoverview Core theme constants and configuration implementing Material Design 3.0 specifications
 * with comprehensive support for responsive design, theme modes, spacing system, and elevation levels.
 * @version 1.0.0
 */

import { Theme, createTheme } from '@mui/material'; // v5.14.0

/**
 * Theme mode constants for light/dark theme implementation
 * Used for consistent theme mode management across the application
 */
export const THEME_MODE = {
  LIGHT: 'light',
  DARK: 'dark'
} as const;

// Type for theme modes
export type ThemeMode = typeof THEME_MODE[keyof typeof THEME_MODE];

/**
 * Responsive breakpoint values following Material Design specifications
 * Implements mobile-first approach with standard breakpoints
 * Values in pixels
 */
export const BREAKPOINTS = {
  xs: 320,  // Mobile devices
  sm: 768,  // Tablets
  md: 1024, // Small laptops
  lg: 1440, // Desktop
  xl: 1920  // Large screens
} as const;

// Type for breakpoints
export type Breakpoint = keyof typeof BREAKPOINTS;

/**
 * 8px grid system spacing constants for consistent component spacing
 * Following Material Design spacing specifications
 * Values in pixels
 */
export const SPACING = {
  unit: 8,    // Base unit for calculations
  base: 8,    // Standard spacing
  medium: 16, // Medium spacing (2 * base)
  large: 24,  // Large spacing (3 * base)
  xlarge: 32  // Extra large spacing (4 * base)
} as const;

// Type for spacing values
export type Spacing = keyof typeof SPACING;

/**
 * Z-index elevation levels for consistent component layering
 * Defines clear hierarchy for overlapping elements
 */
export const ELEVATION = {
  modal: 1000,     // Modal dialogs, critical overlays
  dropdown: 100,    // Dropdowns, popovers
  header: 10,       // Header, navigation
  content: 1,       // Main content
  background: 0     // Background elements
} as const;

// Type for elevation levels
export type Elevation = keyof typeof ELEVATION;

/**
 * Material Design color palette
 * Defines primary, secondary, and semantic colors for both light and dark modes
 */
export const COLORS = {
  light: {
    primary: '#2196F3',    // Primary brand color
    secondary: '#FF4081',  // Secondary brand color
    error: '#F44336',      // Error states
    warning: '#FF9800',    // Warning states
    info: '#2196F3',       // Information states
    success: '#4CAF50',    // Success states
    background: '#FFFFFF', // Background color
    surface: '#F5F5F5',    // Surface color
    text: {
      primary: 'rgba(0, 0, 0, 0.87)',
      secondary: 'rgba(0, 0, 0, 0.60)',
      disabled: 'rgba(0, 0, 0, 0.38)'
    }
  },
  dark: {
    primary: '#90CAF9',    // Primary brand color (dark mode)
    secondary: '#FF80AB',  // Secondary brand color (dark mode)
    error: '#EF5350',      // Error states (dark mode)
    warning: '#FFB74D',    // Warning states (dark mode)
    info: '#90CAF9',       // Information states (dark mode)
    success: '#81C784',    // Success states (dark mode)
    background: '#121212', // Background color (dark mode)
    surface: '#1E1E1E',    // Surface color (dark mode)
    text: {
      primary: 'rgba(255, 255, 255, 0.87)',
      secondary: 'rgba(255, 255, 255, 0.60)',
      disabled: 'rgba(255, 255, 255, 0.38)'
    }
  }
} as const;

/**
 * Typography scale following Material Design specifications
 * Implements responsive font sizing
 */
export const TYPOGRAPHY = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  h1: {
    fontSize: '2.5rem',
    fontWeight: 500,
    lineHeight: 1.2
  },
  h2: {
    fontSize: '2rem',
    fontWeight: 500,
    lineHeight: 1.3
  },
  h3: {
    fontSize: '1.75rem',
    fontWeight: 500,
    lineHeight: 1.4
  },
  body1: {
    fontSize: '1rem',
    fontWeight: 400,
    lineHeight: 1.5
  },
  body2: {
    fontSize: '0.875rem',
    fontWeight: 400,
    lineHeight: 1.43
  },
  button: {
    fontSize: '0.875rem',
    fontWeight: 500,
    lineHeight: 1.75,
    textTransform: 'uppercase'
  }
} as const;

/**
 * Creates a theme configuration based on the provided mode
 * @param mode - Theme mode (light/dark)
 * @returns Material-UI theme configuration
 */
export const createAppTheme = (mode: ThemeMode): Theme => {
  return createTheme({
    palette: {
      mode,
      ...COLORS[mode]
    },
    typography: TYPOGRAPHY,
    spacing: SPACING.unit,
    breakpoints: {
      values: BREAKPOINTS
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: COLORS[mode].background,
            color: COLORS[mode].text.primary
          }
        }
      }
    }
  });
};

/**
 * Default theme configuration
 * Used as fallback and initial theme
 */
export const defaultTheme = createAppTheme(THEME_MODE.LIGHT);