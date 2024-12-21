/**
 * @fileoverview Enhanced input component implementing Material Design 3.0 specifications
 * with comprehensive validation, accessibility features, and theming support.
 * @version 1.0.0
 */

import React, { useCallback, useState, useRef, useEffect } from 'react'; // v18.2.0
import { styled } from '@mui/material/styles'; // v5.14.0
import { TextField, TextFieldProps } from '@mui/material'; // v5.14.0
import debounce from 'lodash/debounce'; // v4.17.21
import { validateInput, ValidationRule } from '../../../utils/validation';
import { theme } from '../../../theme';

// Input types supported by the component
type InputType = 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search';
type InputMode = 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';

// Enhanced props interface extending Material-UI TextField props
interface InputProps extends Omit<TextFieldProps, 'onChange'> {
  name: string;
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>, isValid?: boolean) => void;
  validationRules?: ValidationRule[];
  error?: boolean;
  helperText?: string;
  type?: InputType;
  required?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  inputMode?: InputMode;
}

// Styled TextField component with Material Design 3.0 specifications
const StyledTextField = styled(TextField)(({ theme }) => ({
  '& .MuiInputBase-root': {
    borderRadius: '4px',
    fontSize: '14px',
    transition: 'all 0.2s ease-in-out',
    backgroundColor: theme.palette.background.paper,
    
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
    
    '&.Mui-focused': {
      backgroundColor: theme.palette.background.paper,
      boxShadow: `0 0 0 2px ${theme.palette.primary.main}`,
    },
  },
  
  '& .MuiInputLabel-root': {
    fontSize: '14px',
    color: theme.palette.text.secondary,
    transition: 'color 0.2s ease-in-out',
    
    '&.Mui-focused': {
      color: theme.palette.primary.main,
    },
    
    '&.Mui-error': {
      color: theme.palette.error.main,
    },
  },
  
  '& .MuiFormHelperText-root': {
    marginLeft: 0,
    fontSize: '12px',
    transition: 'color 0.2s ease-in-out',
    
    '&.Mui-error': {
      color: theme.palette.error.main,
    },
  },
  
  // Enhanced focus states for accessibility
  '& .MuiOutlinedInput-root': {
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.primary.main,
      borderWidth: '2px',
    },
    
    '&.Mui-error .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.error.main,
    },
  },
  
  // Disabled state styling
  '&.Mui-disabled': {
    opacity: 0.7,
    backgroundColor: theme.palette.action.disabledBackground,
  },
}));

/**
 * Enhanced Input component with Material Design 3.0 styling, validation,
 * and comprehensive accessibility features.
 */
export const Input: React.FC<InputProps> = React.memo(({
  name,
  label,
  value,
  onChange,
  validationRules = [],
  error = false,
  helperText = '',
  type = 'text',
  required = false,
  disabled = false,
  fullWidth = true,
  inputMode,
  ...props
}) => {
  // State for internal validation handling
  const [internalError, setInternalError] = useState<boolean>(error);
  const [internalHelperText, setInternalHelperText] = useState<string>(helperText);
  
  // Ref for input element
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Debounced validation handler
  const debouncedValidation = useCallback(
    debounce((value: string) => {
      if (validationRules.length > 0) {
        const validationResult = validateInput(value, validationRules);
        setInternalError(!validationResult.isValid);
        setInternalHelperText(validationResult.isValid ? helperText : validationResult.errors[0]?.message || '');
      }
    }, 300),
    [validationRules, helperText]
  );
  
  // Handle input change with validation
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    
    // Trigger validation if rules exist
    if (validationRules.length > 0) {
      debouncedValidation(newValue);
    }
    
    // Call parent onChange handler
    onChange(event, !internalError);
  };
  
  // Handle focus events for accessibility
  const handleFocus = () => {
    if (inputRef.current) {
      inputRef.current.setAttribute('aria-invalid', internalError.toString());
    }
  };
  
  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      debouncedValidation.cancel();
    };
  }, [debouncedValidation]);
  
  return (
    <StyledTextField
      name={name}
      label={label}
      value={value}
      onChange={handleChange}
      onFocus={handleFocus}
      error={internalError}
      helperText={internalHelperText}
      type={type}
      required={required}
      disabled={disabled}
      fullWidth={fullWidth}
      inputRef={inputRef}
      inputMode={inputMode}
      // Enhanced accessibility attributes
      inputProps={{
        'aria-label': label,
        'aria-required': required,
        'aria-invalid': internalError,
        'aria-describedby': `${name}-helper-text`,
      }}
      FormHelperTextProps={{
        id: `${name}-helper-text`,
        'aria-live': 'polite',
      }}
      {...props}
    />
  );
});

// Display name for debugging
Input.displayName = 'Input';

// Default export
export default Input;