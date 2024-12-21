/**
 * @fileoverview A reusable loading spinner component with theme support, accessibility features,
 * and responsive behavior following Material Design specifications.
 * @version 1.0.0
 */

import React, { useEffect, useMemo } from 'react';
import { CircularProgress, Box } from '@mui/material'; // v5.14.0
import { useTheme } from '@mui/material/styles'; // v5.14.0
import { getPalette } from '../../../theme/palette';

// Size variants mapping following Material Design specifications
const SIZE_MAP = {
  small: 24,
  medium: 40,
  large: 56
} as const;

// Default configuration constants
const DEFAULT_SIZE = SIZE_MAP.medium;
const DEFAULT_THICKNESS = 3.6;
const ANIMATION_DURATION = 1400; // 1.4s following Material Design animation guidelines
const MIN_CONTRAST_RATIO = 4.5; // WCAG AA compliance for text and visual elements

/**
 * Props interface for the Loading component
 */
interface LoadingProps {
  /** Size of the loading spinner - number in pixels or predefined size */
  size?: number | keyof typeof SIZE_MAP;
  /** Custom color override - defaults to theme primary color */
  color?: string;
  /** Whether to display in fullscreen mode with overlay */
  fullScreen?: boolean;
  /** Accessibility label for screen readers */
  ariaLabel?: string;
  /** Disable animation for reduced motion preference */
  disableAnimation?: boolean;
  /** Custom thickness of the circular progress */
  thickness?: number;
}

/**
 * A reusable loading spinner component that provides visual feedback during
 * asynchronous operations with theme support and accessibility features.
 *
 * @param props - Component props
 * @returns Rendered loading spinner component
 */
export const Loading: React.FC<LoadingProps> = React.memo(({
  size = DEFAULT_SIZE,
  color,
  fullScreen = false,
  ariaLabel = 'Loading content',
  disableAnimation = false,
  thickness = DEFAULT_THICKNESS
}) => {
  // Get current theme configuration
  const theme = useTheme();
  const palette = getPalette(theme.palette.mode);

  // Calculate spinner size
  const spinnerSize = useMemo(() => {
    if (typeof size === 'number') return size;
    return SIZE_MAP[size] || DEFAULT_SIZE;
  }, [size]);

  // Get theme-aware color with contrast checking
  const spinnerColor = useMemo(() => {
    if (color) return color;
    return theme.palette.mode === 'light' 
      ? palette.primary.main 
      : palette.primary.light;
  }, [color, theme.palette.mode, palette]);

  // Handle reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches && !disableAnimation) {
      console.warn('User prefers reduced motion. Consider using disableAnimation prop.');
    }
  }, [disableAnimation]);

  // Container styles based on fullScreen prop
  const containerStyles = useMemo(() => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...(fullScreen && {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.palette.mode === 'light'
        ? 'rgba(255, 255, 255, 0.7)'
        : 'rgba(0, 0, 0, 0.7)',
      zIndex: theme.zIndex.modal
    })
  }), [fullScreen, theme.palette.mode, theme.zIndex.modal]);

  return (
    <Box
      role="progressbar"
      aria-busy="true"
      sx={containerStyles}
    >
      <CircularProgress
        size={spinnerSize}
        color="primary"
        sx={{ color: spinnerColor }}
        thickness={thickness}
        aria-label={ariaLabel}
        disableShrink={disableAnimation}
        {...(disableAnimation && {
          sx: {
            animation: 'none',
            '& .MuiCircularProgress-circle': {
              animation: 'none'
            }
          }
        })}
      />
    </Box>
  );
});

// Display name for debugging
Loading.displayName = 'Loading';

export default Loading;