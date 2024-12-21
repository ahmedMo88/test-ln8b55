/**
 * @fileoverview A reusable card component following Material Design 3.0 guidelines
 * with enhanced accessibility, responsive behavior, and consistent styling.
 * @version 1.0.0
 */

import React from 'react'; // v18.2.0
import { Card, CardContent, CardActions } from '@mui/material'; // v5.14.0
import { styled } from '@mui/material/styles'; // v5.14.0
import { CARD_BASE_STYLES } from '../../../theme/components';
import { getPalette } from '../../../theme/palette';

/**
 * Props interface for the Card component with comprehensive accessibility
 * and styling options following Material Design specifications.
 */
interface CardProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
  elevation?: number;
  className?: string;
  onClick?: (event: React.MouseEvent) => void;
  ariaLabel?: string;
  role?: string;
  tabIndex?: number;
}

/**
 * Styled card component implementing Material Design 3.0 specifications
 * with responsive behavior and elevation system.
 */
const StyledCard = styled(Card)(({ theme }) => {
  const palette = getPalette(theme.palette.mode);
  
  return {
    ...CARD_BASE_STYLES,
    backgroundColor: palette.background?.paper,
    borderRadius: '8px',
    padding: '16px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    
    // Elevation and hover effects
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: theme.shadows[4],
    },
    
    // Accessibility focus styles
    '&:focus-visible': {
      outline: `2px solid ${palette.primary?.main}`,
      outlineOffset: '2px',
    },
    
    // Responsive adjustments
    '@media (max-width: 600px)': {
      padding: '12px',
      borderRadius: '4px',
    },
  };
});

/**
 * Styled card content with consistent spacing and responsive behavior
 */
const StyledCardContent = styled(CardContent)(({ theme }) => ({
  padding: '16px',
  '&:last-child': {
    paddingBottom: '16px',
  },
  '@media (max-width: 600px)': {
    padding: '12px',
  },
}));

/**
 * Styled card actions with proper alignment and spacing
 */
const StyledCardActions = styled(CardActions)(({ theme }) => ({
  padding: '8px 16px',
  justifyContent: 'flex-end',
  gap: '8px',
  '@media (max-width: 600px)': {
    padding: '8px 12px',
  },
}));

/**
 * CustomCard component providing consistent container styling with enhanced
 * accessibility and responsive behavior.
 * 
 * @component
 * @example
 * ```tsx
 * <CustomCard
 *   elevation={1}
 *   onClick={handleClick}
 *   ariaLabel="Example card"
 * >
 *   <div>Card content</div>
 * </CustomCard>
 * ```
 */
export const CustomCard = React.memo<CardProps>(({
  children,
  actions,
  elevation = 1,
  className,
  onClick,
  ariaLabel,
  role = 'article',
  tabIndex = 0,
}) => {
  /**
   * Handles card interaction events including keyboard navigation
   * for enhanced accessibility.
   */
  const handleInteraction = React.useCallback((
    event: React.KeyboardEvent | React.MouseEvent
  ) => {
    if (onClick) {
      // Handle keyboard events for accessibility
      if (
        event.type === 'keydown' &&
        ((event as React.KeyboardEvent).key === 'Enter' ||
        (event as React.KeyboardEvent).key === ' ')
      ) {
        event.preventDefault();
        onClick(event as React.MouseEvent);
      } else if (event.type === 'click') {
        onClick(event as React.MouseEvent);
      }
    }
  }, [onClick]);

  return (
    <StyledCard
      elevation={elevation}
      className={className}
      onClick={handleInteraction}
      onKeyDown={handleInteraction}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
    >
      <StyledCardContent>
        {children}
      </StyledCardContent>
      
      {actions && (
        <StyledCardActions>
          {actions}
        </StyledCardActions>
      )}
    </StyledCard>
  );
});

// Display name for debugging
CustomCard.displayName = 'CustomCard';

export default CustomCard;