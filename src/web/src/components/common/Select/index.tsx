/**
 * @fileoverview A comprehensive Material UI-based select component implementing Material Design 3.0
 * specifications with enhanced accessibility features, mobile optimization, and error handling.
 * @version 1.0.0
 */

import React, { useCallback, useMemo } from 'react';
import { 
  Select as MuiSelect, 
  MenuItem, 
  FormControl, 
  FormHelperText, 
  InputLabel,
  SelectChangeEvent,
  styled
} from '@mui/material'; // v5.14.0
import { useTheme } from '../../hooks/useTheme';

// Constants for accessibility and analytics
const ARIA_LABELS = {
  SELECT: 'Select option',
  HELPER_TEXT: 'Additional information',
  ERROR_TEXT: 'Error message'
} as const;

const ANALYTICS_EVENTS = {
  CHANGE: 'select_change',
  ERROR: 'select_error'
} as const;

/**
 * Interface for select option items
 */
interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

/**
 * Props interface for the Select component
 */
interface SelectProps {
  value: string | string[] | number | number[];
  onChange: (value: string | string[] | number | number[]) => void;
  options: SelectOption[];
  label?: string;
  error?: boolean;
  helperText?: string;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
  'aria-describedby'?: string;
  virtualized?: boolean;
  maxHeight?: number;
  searchable?: boolean;
  loading?: boolean;
  onSearchChange?: (searchTerm: string) => void;
  analytics?: {
    category: string;
    action: string;
    label?: string;
  };
}

/**
 * Styled Select component implementing Material Design 3.0 specifications
 */
const StyledSelect = styled(MuiSelect)(({ theme }) => ({
  minHeight: '48px',
  borderRadius: '4px',
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: theme.palette.mode === 'light' 
      ? 'rgba(0, 0, 0, 0.23)' 
      : 'rgba(255, 255, 255, 0.23)',
    transition: theme.transitions.create(['border-color', 'box-shadow']),
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: theme.palette.mode === 'light'
      ? 'rgba(0, 0, 0, 0.87)'
      : 'rgba(255, 255, 255, 0.87)',
  },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: theme.palette.primary.main,
    borderWidth: 2,
  },
  '&.Mui-error .MuiOutlinedInput-notchedOutline': {
    borderColor: theme.palette.error.main,
  },
  '&.Mui-disabled': {
    backgroundColor: theme.palette.action.disabledBackground,
    opacity: 0.7,
  },
  '@media (max-width: 600px)': {
    minHeight: '40px',
    fontSize: '16px', // Prevent auto-zoom on iOS
  },
}));

/**
 * Enhanced Select component with comprehensive accessibility support,
 * error handling, and analytics tracking.
 */
export const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  label,
  error = false,
  helperText,
  multiple = false,
  disabled = false,
  className,
  style,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  virtualized = false,
  maxHeight = 300,
  searchable = false,
  loading = false,
  onSearchChange,
  analytics,
}) => {
  const { theme } = useTheme();

  // Generate unique IDs for accessibility
  const selectId = useMemo(() => `select-${Math.random().toString(36).substr(2, 9)}`, []);
  const helperId = useMemo(() => `helper-${selectId}`, [selectId]);

  /**
   * Enhanced change handler with error handling and analytics
   */
  const handleChange = useCallback((event: SelectChangeEvent<unknown>) => {
    try {
      event.preventDefault();
      const newValue = event.target.value;

      // Handle multi-select array type conversion
      const processedValue = multiple 
        ? (Array.isArray(newValue) ? newValue : [newValue])
        : newValue;

      // Call onChange callback
      onChange(processedValue);

      // Track analytics event if configured
      if (analytics) {
        window.dispatchEvent(new CustomEvent(ANALYTICS_EVENTS.CHANGE, {
          detail: {
            category: analytics.category,
            action: analytics.action || ANALYTICS_EVENTS.CHANGE,
            label: analytics.label || String(newValue),
          },
        }));
      }

      // Update ARIA live region
      const liveRegion = document.getElementById('select-live-region');
      if (liveRegion) {
        liveRegion.textContent = `Selected: ${
          multiple 
            ? (processedValue as Array<string | number>).join(', ')
            : processedValue
        }`;
      }
    } catch (error) {
      console.error('Error handling select change:', error);
      window.dispatchEvent(new CustomEvent(ANALYTICS_EVENTS.ERROR, {
        detail: { error, operation: 'change' },
      }));
    }
  }, [multiple, onChange, analytics]);

  // Memoize menu props for performance
  const menuProps = useMemo(() => ({
    PaperProps: {
      style: {
        maxHeight,
        width: 'auto',
        minWidth: '200px',
      },
    },
    anchorOrigin: {
      vertical: 'bottom',
      horizontal: 'left',
    },
    transformOrigin: {
      vertical: 'top',
      horizontal: 'left',
    },
    elevation: 8,
    marginThreshold: 8,
    TransitionProps: {
      timeout: 200,
    },
  }), [maxHeight]);

  return (
    <FormControl 
      fullWidth 
      error={error}
      disabled={disabled}
      className={className}
      style={style}
    >
      {label && (
        <InputLabel 
          id={`${selectId}-label`}
          shrink={Boolean(value)}
        >
          {label}
        </InputLabel>
      )}

      <StyledSelect
        id={selectId}
        labelId={`${selectId}-label`}
        value={value}
        onChange={handleChange}
        multiple={multiple}
        disabled={disabled}
        aria-label={ariaLabel || label || ARIA_LABELS.SELECT}
        aria-describedby={ariaDescribedBy || (helperText ? helperId : undefined)}
        aria-invalid={error}
        aria-busy={loading}
        MenuProps={menuProps}
      >
        {options.map((option) => (
          <MenuItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            aria-selected={
              multiple
                ? (value as Array<string | number>).includes(option.value)
                : value === option.value
            }
          >
            {option.label}
          </MenuItem>
        ))}
      </StyledSelect>

      {helperText && (
        <FormHelperText
          id={helperId}
          error={error}
          aria-label={error ? ARIA_LABELS.ERROR_TEXT : ARIA_LABELS.HELPER_TEXT}
        >
          {helperText}
        </FormHelperText>
      )}

      {/* Hidden live region for screen reader announcements */}
      <div
        id="select-live-region"
        aria-live="polite"
        aria-atomic="true"
        style={{ position: 'absolute', height: 1, width: 1, overflow: 'hidden' }}
      />
    </FormControl>
  );
};

export default Select;