/**
 * @fileoverview Enhanced registration page component implementing secure user account creation
 * with comprehensive form validation, OAuth 2.0 + JWT authentication, and optional MFA setup.
 * Follows Material Design 3.0 specifications and WCAG 2.1 Level AA accessibility guidelines.
 * @version 1.0.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Button,
  Box,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Alert,
  Stepper,
  Step,
  StepLabel,
  useTheme,
  useMediaQuery
} from '@mui/material';
import { styled } from '@mui/material/styles';
import Input from '../../components/common/Input';
import { RegisterData } from '../../types/auth.types';
import { registerThunk, selectAuth } from '../../store/slices/authSlice';
import { validateInput } from '../../utils/validation';

// Styled components following Material Design 3.0
const StyledContainer = styled(Container)(({ theme }) => ({
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: theme.spacing(3),
}));

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  width: '100%',
  maxWidth: 480,
  borderRadius: theme.shape.borderRadius,
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(3),
  },
}));

// Registration steps
const REGISTRATION_STEPS = ['Account Details', 'Security Setup', 'Verification'];

// Form validation rules
const VALIDATION_RULES = {
  email: [
    { type: 'required', message: 'Email is required' },
    { type: 'email', message: 'Please enter a valid email address' },
    { type: 'pattern', pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: 'Invalid email format' }
  ],
  password: [
    { type: 'required', message: 'Password is required' },
    { type: 'minLength', value: 12, message: 'Password must be at least 12 characters' },
    { type: 'pattern', pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/, 
      message: 'Password must include uppercase, lowercase, number and special character' }
  ],
  firstName: [
    { type: 'required', message: 'First name is required' },
    { type: 'minLength', value: 2, message: 'First name must be at least 2 characters' }
  ],
  lastName: [
    { type: 'required', message: 'Last name is required' },
    { type: 'minLength', value: 2, message: 'Last name must be at least 2 characters' }
  ]
};

/**
 * Enhanced registration page component with security features and accessibility
 */
const Register: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { isLoading, error } = useSelector(selectAuth);

  // Form state
  const [formData, setFormData] = useState<RegisterData>({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    isMfaEnabled: true,
    acceptedTerms: false,
    deviceFingerprint: '',
  });

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeStep, setActiveStep] = useState(0);
  const [passwordStrength, setPasswordStrength] = useState(0);

  // Generate device fingerprint on mount
  useEffect(() => {
    const generateFingerprint = async () => {
      try {
        const fingerprint = await navigator.userAgent + navigator.language + 
          screen.width + screen.height + new Date().getTimezoneOffset();
        setFormData(prev => ({ ...prev, deviceFingerprint: btoa(fingerprint) }));
      } catch (error) {
        console.error('Error generating device fingerprint:', error);
      }
    };
    generateFingerprint();
  }, []);

  // Validate form field
  const validateField = useCallback((name: string, value: string) => {
    const rules = VALIDATION_RULES[name as keyof typeof VALIDATION_RULES];
    if (rules) {
      const validationResult = validateInput(value, rules);
      setErrors(prev => ({
        ...prev,
        [name]: validationResult.isValid ? '' : validationResult.errors[0]?.message || ''
      }));
      return validationResult.isValid;
    }
    return true;
  }, []);

  // Handle input change with validation
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    validateField(name, value);

    // Additional password strength check
    if (name === 'password') {
      const strength = calculatePasswordStrength(value);
      setPasswordStrength(strength);
    }
  };

  // Calculate password strength
  const calculatePasswordStrength = (password: string): number => {
    let score = 0;
    if (password.length >= 12) score += 25;
    if (/[A-Z]/.test(password)) score += 25;
    if (/[a-z]/.test(password)) score += 25;
    if (/[0-9]/.test(password)) score += 15;
    if (/[^A-Za-z0-9]/.test(password)) score += 10;
    return score;
  };

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    // Validate all fields
    const validationErrors: Record<string, string> = {};
    Object.keys(VALIDATION_RULES).forEach(field => {
      const isValid = validateField(field, formData[field as keyof RegisterData] as string);
      if (!isValid) {
        validationErrors[field] = errors[field] || 'Invalid field';
      }
    });

    // Additional validation
    if (formData.password !== formData.confirmPassword) {
      validationErrors.confirmPassword = 'Passwords do not match';
    }

    if (!formData.acceptedTerms) {
      validationErrors.acceptedTerms = 'You must accept the terms and conditions';
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    try {
      const result = await dispatch(registerThunk(formData));
      if (result.meta.requestStatus === 'fulfilled') {
        navigate('/mfa-setup');
      }
    } catch (error) {
      console.error('Registration error:', error);
    }
  };

  // Render registration form
  return (
    <StyledContainer>
      <StyledPaper elevation={3}>
        <Typography variant="h4" align="center" gutterBottom>
          Create Account
        </Typography>

        <Stepper activeStep={activeStep} alternativeLabel={!isMobile}>
          {REGISTRATION_STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 3 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error.message}
            </Alert>
          )}

          <Input
            name="email"
            label="Email Address"
            value={formData.email}
            onChange={handleChange}
            error={!!errors.email}
            helperText={errors.email}
            type="email"
            required
            fullWidth
            autoComplete="email"
            inputMode="email"
          />

          <Box sx={{ mt: 2 }}>
            <Input
              name="password"
              label="Password"
              value={formData.password}
              onChange={handleChange}
              error={!!errors.password}
              helperText={errors.password}
              type="password"
              required
              fullWidth
            />
            {formData.password && (
              <Box sx={{ mt: 1 }}>
                <LinearProgress variant="determinate" value={passwordStrength} />
                <Typography variant="caption" color="textSecondary">
                  Password strength: {passwordStrength}%
                </Typography>
              </Box>
            )}
          </Box>

          <Box sx={{ mt: 2 }}>
            <Input
              name="confirmPassword"
              label="Confirm Password"
              value={formData.confirmPassword}
              onChange={handleChange}
              error={!!errors.confirmPassword}
              helperText={errors.confirmPassword}
              type="password"
              required
              fullWidth
            />
          </Box>

          <Box sx={{ mt: 2 }}>
            <Input
              name="firstName"
              label="First Name"
              value={formData.firstName}
              onChange={handleChange}
              error={!!errors.firstName}
              helperText={errors.firstName}
              required
              fullWidth
            />
          </Box>

          <Box sx={{ mt: 2 }}>
            <Input
              name="lastName"
              label="Last Name"
              value={formData.lastName}
              onChange={handleChange}
              error={!!errors.lastName}
              helperText={errors.lastName}
              required
              fullWidth
            />
          </Box>

          <FormControlLabel
            control={
              <Checkbox
                checked={formData.isMfaEnabled}
                onChange={(e) => setFormData(prev => ({ ...prev, isMfaEnabled: e.target.checked }))}
                color="primary"
              />
            }
            label="Enable two-factor authentication (recommended)"
            sx={{ mt: 2 }}
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={formData.acceptedTerms}
                onChange={(e) => setFormData(prev => ({ ...prev, acceptedTerms: e.target.checked }))}
                color="primary"
              />
            }
            label="I accept the terms and conditions"
            sx={{ mt: 1 }}
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={isLoading}
            sx={{ mt: 3, mb: 2 }}
          >
            {isLoading ? <CircularProgress size={24} /> : 'Create Account'}
          </Button>

          <Typography variant="body2" align="center" color="textSecondary">
            Already have an account?{' '}
            <Button
              color="primary"
              onClick={() => navigate('/login')}
              sx={{ textTransform: 'none' }}
            >
              Sign in
            </Button>
          </Typography>
        </Box>
      </StyledPaper>
    </StyledContainer>
  );
};

export default Register;