/**
 * @fileoverview Material UI component style overrides implementing Material Design 3.0 specifications
 * with comprehensive support for light/dark themes, accessibility features, and responsive design.
 * @version 1.0.0
 */

import { Components } from '@mui/material/styles'; // v5.14.0
import { THEME_MODE } from '../constants/theme';
import { getPalette } from './palette';

// Base styles for consistent button appearance across themes
const BUTTON_BASE_STYLES = {
  borderRadius: '4px',
  textTransform: 'none',
  fontWeight: 500,
  minHeight: '48px',
  touchAction: 'manipulation',
  transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)'
} as const;

// Base styles for card components with elevation system
const CARD_BASE_STYLES = {
  borderRadius: '8px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  transition: 'box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1)'
} as const;

// Base styles for input components with consistent sizing
const INPUT_BASE_STYLES = {
  borderRadius: '4px',
  fontSize: '14px',
  minHeight: '48px',
  transition: 'border-color 200ms cubic-bezier(0.4, 0, 0.2, 1)'
} as const;

// Base styles for modal components with backdrop effects
const MODAL_BASE_STYLES = {
  backdropFilter: 'blur(4px)',
  borderRadius: '8px',
  maxWidth: '90vw',
  maxHeight: '90vh',
  margin: 'auto'
} as const;

// Base styles for table components with responsive features
const TABLE_BASE_STYLES = {
  borderCollapse: 'separate',
  borderSpacing: 0,
  width: '100%',
  overflowX: 'auto'
} as const;

/**
 * Generates comprehensive Material UI component style overrides based on theme mode
 * with accessibility and responsive design features.
 * 
 * @param mode - Theme mode ('light' or 'dark')
 * @returns Theme-specific component style configuration
 */
export const getComponents = (mode: typeof THEME_MODE[keyof typeof THEME_MODE]): Components => {
  const palette = getPalette(mode);
  
  return {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
        disableRipple: false
      },
      styleOverrides: {
        root: {
          ...BUTTON_BASE_STYLES,
          '&:focus-visible': {
            outline: `2px solid ${palette.primary?.main}`,
            outlineOffset: '2px'
          },
          '@media (hover: hover)': {
            '&:hover': {
              backgroundColor: palette.action?.hover
            }
          },
          '@media (max-width: 600px)': {
            minHeight: '40px',
            padding: '8px 16px'
          }
        },
        contained: {
          '&:hover': {
            backgroundColor: palette.primary?.hover
          },
          '&:active': {
            backgroundColor: palette.primary?.active
          },
          '&.Mui-disabled': {
            backgroundColor: palette.action?.disabledBackground
          }
        },
        outlined: {
          borderColor: palette.divider,
          '&:hover': {
            borderColor: palette.primary?.main,
            backgroundColor: palette.action?.hover
          }
        }
      }
    },
    
    MuiCard: {
      defaultProps: {
        elevation: 0
      },
      styleOverrides: {
        root: {
          ...CARD_BASE_STYLES,
          backgroundColor: palette.background?.paper,
          '&:hover': {
            boxShadow: '0 4px 8px rgba(0,0,0,0.12)'
          },
          '@media (max-width: 600px)': {
            borderRadius: '4px'
          }
        }
      }
    },

    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        fullWidth: true
      },
      styleOverrides: {
        root: {
          ...INPUT_BASE_STYLES,
          '& .MuiOutlinedInput-root': {
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: palette.primary?.main,
              borderWidth: '2px'
            },
            '&.Mui-error .MuiOutlinedInput-notchedOutline': {
              borderColor: palette.error?.main
            },
            '@media (max-width: 600px)': {
              fontSize: '16px' // Prevent auto-zoom on iOS
            }
          }
        }
      }
    },

    MuiSelect: {
      defaultProps: {
        variant: 'outlined'
      },
      styleOverrides: {
        root: {
          ...INPUT_BASE_STYLES,
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: palette.primary?.main,
            borderWidth: '2px'
          }
        }
      }
    },

    MuiModal: {
      styleOverrides: {
        root: {
          ...MODAL_BASE_STYLES,
          '@media (max-width: 600px)': {
            maxWidth: '95vw',
            maxHeight: '95vh'
          }
        },
        backdrop: {
          backgroundColor: mode === THEME_MODE.LIGHT 
            ? 'rgba(0, 0, 0, 0.5)'
            : 'rgba(0, 0, 0, 0.7)'
        }
      }
    },

    MuiTable: {
      styleOverrides: {
        root: {
          ...TABLE_BASE_STYLES,
          '& .MuiTableCell-root': {
            borderColor: palette.divider
          },
          '@media (max-width: 600px)': {
            '& .MuiTableCell-root': {
              padding: '8px'
            }
          }
        }
      }
    },

    // Accessibility enhancements
    MuiFocusVisible: {
      defaultProps: {
        disableRipple: false
      }
    },

    // Touch target sizes for mobile
    MuiIconButton: {
      styleOverrides: {
        root: {
          padding: '12px',
          '@media (max-width: 600px)': {
            padding: '8px'
          }
        }
      }
    },

    // Enhanced contrast for disabled states
    MuiInputBase: {
      styleOverrides: {
        root: {
          '&.Mui-disabled': {
            opacity: 0.7,
            backgroundColor: mode === THEME_MODE.LIGHT
              ? 'rgba(0, 0, 0, 0.04)'
              : 'rgba(255, 255, 255, 0.04)'
          }
        }
      }
    }
  };
};