/**
 * @fileoverview Material Design 3.0 color palette configuration implementing theme-specific
 * color schemes with comprehensive color variations and WCAG-compliant contrast ratios.
 * @version 1.0.0
 */

import { PaletteOptions } from '@mui/material'; // v5.14.0
import { THEME_MODE } from '../constants/theme';

/**
 * Light theme palette configuration with WCAG AA compliant contrast ratios
 * Primary: Blue (#2196F3) - Used for primary actions and key elements
 * Secondary: Pink (#FF4081) - Used for floating action buttons and selection controls
 */
const LIGHT_PALETTE = {
  mode: 'light',
  primary: {
    main: '#2196F3',
    light: '#64B5F6',
    dark: '#1976D2',
    contrastText: '#FFFFFF',
    hover: '#1E88E5',
    active: '#1565C0',
    disabled: '#90CAF9',
    '100': '#BBDEFB',
    '200': '#90CAF9',
    '300': '#64B5F6',
    '400': '#42A5F5',
    '500': '#2196F3',
    '600': '#1E88E5',
    '700': '#1976D2',
    '800': '#1565C0',
    '900': '#0D47A1'
  },
  secondary: {
    main: '#FF4081',
    light: '#FF80AB',
    dark: '#F50057',
    contrastText: '#FFFFFF',
    hover: '#F50057',
    active: '#C51162',
    disabled: '#FF80AB',
    '100': '#FF80AB',
    '200': '#FF4081',
    '300': '#F50057',
    '400': '#EC407A',
    '500': '#E91E63',
    '600': '#D81B60',
    '700': '#C2185B',
    '800': '#AD1457',
    '900': '#880E4F'
  },
  error: {
    main: '#F44336',
    light: '#E57373',
    dark: '#D32F2F',
    contrastText: '#FFFFFF',
    hover: '#E53935',
    active: '#C62828',
    disabled: '#EF9A9A'
  },
  warning: {
    main: '#FF9800',
    light: '#FFB74D',
    dark: '#F57C00',
    contrastText: '#000000',
    hover: '#FB8C00',
    active: '#EF6C00',
    disabled: '#FFE0B2'
  },
  info: {
    main: '#2196F3',
    light: '#64B5F6',
    dark: '#1976D2',
    contrastText: '#FFFFFF',
    hover: '#1E88E5',
    active: '#1565C0',
    disabled: '#90CAF9'
  },
  success: {
    main: '#4CAF50',
    light: '#81C784',
    dark: '#388E3C',
    contrastText: '#FFFFFF',
    hover: '#43A047',
    active: '#2E7D32',
    disabled: '#A5D6A7'
  },
  grey: {
    '50': '#FAFAFA',
    '100': '#F5F5F5',
    '200': '#EEEEEE',
    '300': '#E0E0E0',
    '400': '#BDBDBD',
    '500': '#9E9E9E',
    '600': '#757575',
    '700': '#616161',
    '800': '#424242',
    '900': '#212121'
  },
  background: {
    default: '#FFFFFF',
    paper: '#F5F5F5',
    contrast: '#121212'
  },
  text: {
    primary: 'rgba(0, 0, 0, 0.87)',
    secondary: 'rgba(0, 0, 0, 0.60)',
    disabled: 'rgba(0, 0, 0, 0.38)'
  },
  divider: 'rgba(0, 0, 0, 0.12)',
  action: {
    active: 'rgba(0, 0, 0, 0.54)',
    hover: 'rgba(0, 0, 0, 0.04)',
    selected: 'rgba(0, 0, 0, 0.08)',
    disabled: 'rgba(0, 0, 0, 0.26)',
    disabledBackground: 'rgba(0, 0, 0, 0.12)',
    focus: 'rgba(0, 0, 0, 0.12)'
  }
} as const;

/**
 * Dark theme palette configuration with WCAG AA compliant contrast ratios
 * Primary: Light Blue (#90CAF9) - Adjusted for dark theme visibility
 * Secondary: Light Pink (#FF80AB) - Adjusted for dark theme visibility
 */
const DARK_PALETTE = {
  mode: 'dark',
  primary: {
    main: '#90CAF9',
    light: '#BBDEFB',
    dark: '#42A5F5',
    contrastText: '#000000',
    hover: '#64B5F6',
    active: '#2196F3',
    disabled: '#E3F2FD',
    '100': '#E3F2FD',
    '200': '#BBDEFB',
    '300': '#90CAF9',
    '400': '#64B5F6',
    '500': '#42A5F5',
    '600': '#2196F3',
    '700': '#1E88E5',
    '800': '#1976D2',
    '900': '#1565C0'
  },
  secondary: {
    main: '#FF80AB',
    light: '#FF99BC',
    dark: '#FF4081',
    contrastText: '#000000',
    hover: '#FF4081',
    active: '#F50057',
    disabled: '#FCE4EC',
    '100': '#FCE4EC',
    '200': '#FF99BC',
    '300': '#FF80AB',
    '400': '#FF4081',
    '500': '#F50057',
    '600': '#E91E63',
    '700': '#D81B60',
    '800': '#C2185B',
    '900': '#AD1457'
  },
  error: {
    main: '#EF5350',
    light: '#E57373',
    dark: '#F44336',
    contrastText: '#000000',
    hover: '#E53935',
    active: '#C62828',
    disabled: '#FFCDD2'
  },
  warning: {
    main: '#FFB74D',
    light: '#FFE0B2',
    dark: '#FFA726',
    contrastText: '#000000',
    hover: '#FB8C00',
    active: '#EF6C00',
    disabled: '#FFE0B2'
  },
  info: {
    main: '#90CAF9',
    light: '#BBDEFB',
    dark: '#42A5F5',
    contrastText: '#000000',
    hover: '#64B5F6',
    active: '#2196F3',
    disabled: '#E3F2FD'
  },
  success: {
    main: '#66BB6A',
    light: '#81C784',
    dark: '#4CAF50',
    contrastText: '#000000',
    hover: '#43A047',
    active: '#2E7D32',
    disabled: '#C8E6C9'
  },
  grey: {
    '50': '#FAFAFA',
    '100': '#F5F5F5',
    '200': '#EEEEEE',
    '300': '#E0E0E0',
    '400': '#BDBDBD',
    '500': '#9E9E9E',
    '600': '#757575',
    '700': '#616161',
    '800': '#424242',
    '900': '#212121'
  },
  background: {
    default: '#121212',
    paper: '#1E1E1E',
    contrast: '#FFFFFF'
  },
  text: {
    primary: 'rgba(255, 255, 255, 0.87)',
    secondary: 'rgba(255, 255, 255, 0.60)',
    disabled: 'rgba(255, 255, 255, 0.38)'
  },
  divider: 'rgba(255, 255, 255, 0.12)',
  action: {
    active: 'rgba(255, 255, 255, 0.54)',
    hover: 'rgba(255, 255, 255, 0.08)',
    selected: 'rgba(255, 255, 255, 0.16)',
    disabled: 'rgba(255, 255, 255, 0.26)',
    disabledBackground: 'rgba(255, 255, 255, 0.12)',
    focus: 'rgba(255, 255, 255, 0.12)'
  }
} as const;

/**
 * Generates a Material UI color palette based on the specified theme mode
 * with proper contrast ratios and accessibility support.
 * 
 * @param mode - Theme mode ('light' or 'dark')
 * @returns Theme-specific color palette configuration with comprehensive color variations
 */
export const getPalette = (mode: typeof THEME_MODE[keyof typeof THEME_MODE]): PaletteOptions => {
  // Validate theme mode
  if (mode !== THEME_MODE.LIGHT && mode !== THEME_MODE.DARK) {
    console.warn(`Invalid theme mode: ${mode}. Falling back to light theme.`);
    return LIGHT_PALETTE;
  }

  // Return appropriate palette based on theme mode
  return mode === THEME_MODE.LIGHT ? LIGHT_PALETTE : DARK_PALETTE;
};