/**
 * @fileoverview Main theme configuration implementing Material Design 3.0 with comprehensive
 * support for light/dark modes, responsive design, and consistent styling system.
 * @version 1.0.0
 */

import { createTheme, Theme } from '@mui/material/styles'; // v5.14.0
import { getPalette } from './palette';
import { typography } from './typography';
import { getComponents } from './components';
import { 
  THEME_MODE,
  BREAKPOINTS,
  SPACING
} from '../constants/theme';

// Default theme configuration with consistent styling across the application
const DEFAULT_THEME_CONFIG = {
  shape: {
    borderRadius: 4
  },
  mixins: {
    toolbar: {
      minHeight: 64,
      '@media (max-width: 600px)': {
        minHeight: 56
      }
    }
  },
  transitions: {
    duration: {
      shortest: 150,
      shorter: 200,
      short: 250,
      standard: 300,
      complex: 375,
      enteringScreen: 225,
      leavingScreen: 195
    },
    easing: {
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      sharp: 'cubic-bezier(0.4, 0, 0.6, 1)'
    }
  }
} as const;

/**
 * Creates a customized Material UI theme instance with comprehensive styling configuration
 * including responsive design, consistent spacing, and proper theme mode support.
 * 
 * @param mode - Theme mode ('light' or 'dark')
 * @returns Complete Material UI theme configuration
 */
export const createAppTheme = (mode: typeof THEME_MODE[keyof typeof THEME_MODE]): Theme => {
  // Validate theme mode
  if (mode !== THEME_MODE.LIGHT && mode !== THEME_MODE.DARK) {
    console.warn(`Invalid theme mode: ${mode}. Falling back to light theme.`);
    mode = THEME_MODE.LIGHT;
  }

  // Create theme instance with comprehensive configuration
  return createTheme({
    // Theme mode specific palette
    palette: getPalette(mode),

    // Typography system with responsive scaling
    typography,

    // Responsive breakpoints configuration
    breakpoints: {
      values: BREAKPOINTS,
      unit: 'px',
      step: 5
    },

    // Spacing system based on 8px grid
    spacing: (factor: number) => `${SPACING.unit * factor}px`,

    // Component style overrides
    components: getComponents(mode),

    // Default theme configuration
    ...DEFAULT_THEME_CONFIG,

    // Enable CSS baseline normalization
    cssBaseline: {
      '@global': {
        html: {
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          boxSizing: 'border-box'
        },
        '*, *::before, *::after': {
          boxSizing: 'inherit'
        },
        body: {
          margin: 0,
          padding: 0,
          minHeight: '100vh',
          scrollBehavior: 'smooth'
        },
        '#root': {
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column'
        }
      }
    },

    // Z-index management
    zIndex: {
      mobileStepper: 1000,
      speedDial: 1050,
      appBar: 1100,
      drawer: 1200,
      modal: 1300,
      snackbar: 1400,
      tooltip: 1500
    }
  });
};

// Export theme creation function as default
export default createAppTheme;