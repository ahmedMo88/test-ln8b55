/**
 * @fileoverview Enhanced Material Design 3.0 button component with loading state,
 * accessibility features, and theme-aware styling.
 * @version 1.0.0
 */

import React, { useEffect, useRef } from 'react'; // v18.2.0
import { Button, ButtonProps, CircularProgress } from '@mui/material'; // v5.14.0
import { styled } from '@mui/material/styles'; // v5.14.0
import { getPalette } from '../../theme/palette';

/**
 * Extended button props interface with loading state and accessibility features
 */
export interface CustomButtonProps extends ButtonProps {
  loading?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
  ariaLabel?: string;
  loadingLabel?: string;
}

/**
 * Styled Material UI button with theme-aware styles and grid system compliance
 */
const StyledButton = styled(Button)(({ theme }) => ({
  // Base styles following 8px grid system
  borderRadius: '4px',
  textTransform: 'none',
  fontWeight: 500,
  padding: '8px 16px',
  position: 'relative',
  minHeight: '40px',
  minWidth: '64px',
  touchAction: 'manipulation',
  transition: 'all 0.2s ease-in-out',

  // Theme-aware hover states
  '&:hover': {
    backgroundColor: theme.palette.mode === 'light' 
      ? theme.palette.primary.hover 
      : theme.palette.primary.light,
  },

  // Active state styles
  '&:active': {
    backgroundColor: theme.palette.mode === 'light'
      ? theme.palette.primary.active
      : theme.palette.primary.main,
  },

  // Disabled state styles
  '&.Mui-disabled': {
    backgroundColor: theme.palette.mode === 'light'
      ? theme.palette.primary.disabled
      : theme.palette.action.disabledBackground,
    color: theme.palette.text.disabled,
  },

  // Loading state styles
  '&.loading': {
    opacity: 0.7,
    pointerEvents: 'none',
    cursor: 'not-allowed',
  },

  // Full width styles
  '&.fullWidth': {
    width: '100%',
  },

  // Focus visible styles for accessibility
  '&.Mui-focusVisible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: '2px',
  },
}));

/**
 * Loading indicator styles
 */
const StyledCircularProgress = styled(CircularProgress)(({ theme }) => ({
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  color: 'inherit',
  width: '20px !important',
  height: '20px !important',
}));

/**
 * Enhanced button component with loading state, accessibility features,
 * and consistent styling
 */
export const CustomButton = React.forwardRef<HTMLButtonElement, CustomButtonProps>(
  (
    {
      children,
      loading = false,
      disabled = false,
      fullWidth = false,
      ariaLabel,
      loadingLabel = 'Loading...',
      className = '',
      onClick,
      ...props
    },
    ref
  ) => {
    // Track mounted state for async operations
    const isMounted = useRef(true);

    useEffect(() => {
      return () => {
        isMounted.current = false;
      };
    }, []);

    // Combine disabled states
    const isDisabled = disabled || loading;

    // Combine class names
    const buttonClasses = [
      className,
      loading ? 'loading' : '',
      fullWidth ? 'fullWidth' : '',
    ].filter(Boolean).join(' ');

    // Handle click with loading state
    const handleClick = async (
      event: React.MouseEvent<HTMLButtonElement, MouseEvent>
    ) => {
      if (loading || !onClick) return;

      try {
        await onClick(event);
      } catch (error) {
        console.error('Button click error:', error);
      }
    };

    return (
      <StyledButton
        ref={ref}
        disabled={isDisabled}
        className={buttonClasses}
        onClick={handleClick}
        aria-label={ariaLabel}
        aria-busy={loading}
        aria-disabled={isDisabled}
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        {...props}
      >
        {/* Loading spinner */}
        {loading && (
          <StyledCircularProgress
            aria-label={loadingLabel}
            role="progressbar"
          />
        )}
        
        {/* Button content with proper opacity when loading */}
        <span
          style={{
            visibility: loading ? 'hidden' : 'visible',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {children}
        </span>
      </StyledButton>
    );
  }
);

// Display name for dev tools
CustomButton.displayName = 'CustomButton';

// Default props
CustomButton.defaultProps = {
  variant: 'contained',
  color: 'primary',
  loading: false,
  fullWidth: false,
};

export default CustomButton;