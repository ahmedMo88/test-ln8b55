/**
 * @fileoverview Enhanced Profile page component implementing secure user profile management
 * with MFA setup capabilities, Material Design 3.0 specifications, and comprehensive
 * accessibility features following SOC2/HIPAA compliance requirements.
 * @version 1.0.0
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  Card, 
  CardContent, 
  Typography, 
  Button, 
  Grid, 
  CircularProgress, 
  Alert 
} from '@mui/material';
import { useFormik } from 'formik';
import * as yup from 'yup';

// Internal imports
import { User } from '../../types/auth.types';
import AuthService from '../../services/auth.service';
import Input from '../../components/common/Input';

// Profile form validation schema with security requirements
const validationSchema = yup.object({
  firstName: yup
    .string()
    .required('First name is required')
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must not exceed 50 characters')
    .matches(/^[a-zA-Z\s-']+$/, 'First name contains invalid characters'),
  lastName: yup
    .string()
    .required('Last name is required')
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must not exceed 50 characters')
    .matches(/^[a-zA-Z\s-']+$/, 'Last name contains invalid characters'),
  email: yup
    .string()
    .required('Email is required')
    .email('Invalid email format')
    .max(255, 'Email must not exceed 255 characters'),
  preferences: yup.object().shape({
    notifications: yup.boolean(),
    theme: yup.string().oneOf(['light', 'dark']),
    language: yup.string().min(2).max(5)
  })
});

// Interface for profile form data
interface ProfileFormData {
  firstName: string;
  lastName: string;
  email: string;
  preferences: {
    notifications: boolean;
    theme: 'light' | 'dark';
    language: string;
  };
}

// Interface for profile component state
interface ProfileState {
  isLoading: boolean;
  error: string | null;
  mfaSetupData: {
    qrCode: string;
    secret: string;
  } | null;
  isMfaVerifying: boolean;
  mfaError: string | null;
}

/**
 * Enhanced Profile component with security monitoring and accessibility features
 */
const Profile: React.FC = () => {
  // State management
  const [state, setState] = useState<ProfileState>({
    isLoading: true,
    error: null,
    mfaSetupData: null,
    isMfaVerifying: false,
    mfaError: null
  });

  const dispatch = useDispatch();
  const user = useSelector((state: any) => state.auth.user) as User;

  // Initialize form with user data
  const formik = useFormik<ProfileFormData>({
    initialValues: {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
      preferences: user?.preferences || {
        notifications: true,
        theme: 'light',
        language: 'en'
      }
    },
    validationSchema,
    onSubmit: handleProfileUpdate,
    validateOnBlur: true
  });

  // Load user data on component mount
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const currentUser = await AuthService.getCurrentUser();
        if (currentUser) {
          formik.setValues({
            firstName: currentUser.firstName,
            lastName: currentUser.lastName,
            email: currentUser.email,
            preferences: currentUser.preferences
          });
        }
        setState(prev => ({ ...prev, isLoading: false }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to load user data'
        }));
      }
    };

    loadUserData();
  }, []);

  /**
   * Handles secure profile update with validation and error handling
   */
  async function handleProfileUpdate(values: ProfileFormData): Promise<void> {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      await AuthService.updateProfile({
        ...values,
        id: user.id
      });

      // Update success notification
      setState(prev => ({ ...prev, isLoading: false }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to update profile'
      }));
    }
  }

  /**
   * Handles MFA setup initiation with security checks
   */
  const handleMfaSetup = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, mfaError: null }));

      const mfaData = await AuthService.setupMfa('totp');
      setState(prev => ({
        ...prev,
        isLoading: false,
        mfaSetupData: mfaData
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        mfaError: 'Failed to setup MFA'
      }));
    }
  }, []);

  /**
   * Handles MFA verification with security validation
   */
  const handleMfaVerify = useCallback(async (token: string) => {
    try {
      setState(prev => ({ ...prev, isMfaVerifying: true, mfaError: null }));

      await AuthService.verifyMfa(token);
      setState(prev => ({
        ...prev,
        isMfaVerifying: false,
        mfaSetupData: null
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isMfaVerifying: false,
        mfaError: 'Invalid verification code'
      }));
    }
  }, []);

  // Loading state
  if (state.isLoading) {
    return (
      <Grid container justifyContent="center" alignItems="center" sx={{ minHeight: '400px' }}>
        <CircularProgress aria-label="Loading profile data" />
      </Grid>
    );
  }

  return (
    <Grid container spacing={3} sx={{ p: 3 }}>
      {/* Error alerts */}
      {(state.error || state.mfaError) && (
        <Grid item xs={12}>
          <Alert 
            severity="error"
            onClose={() => setState(prev => ({ ...prev, error: null, mfaError: null }))}
          >
            {state.error || state.mfaError}
          </Alert>
        </Grid>
      )}

      {/* Profile form */}
      <Grid item xs={12} md={8}>
        <Card>
          <CardContent>
            <Typography variant="h5" component="h1" gutterBottom>
              Profile Information
            </Typography>
            <form onSubmit={formik.handleSubmit} aria-label="Profile update form">
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Input
                    name="firstName"
                    label="First Name"
                    value={formik.values.firstName}
                    onChange={formik.handleChange}
                    error={formik.touched.firstName && Boolean(formik.errors.firstName)}
                    helperText={formik.touched.firstName && formik.errors.firstName}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Input
                    name="lastName"
                    label="Last Name"
                    value={formik.values.lastName}
                    onChange={formik.handleChange}
                    error={formik.touched.lastName && Boolean(formik.errors.lastName)}
                    helperText={formik.touched.lastName && formik.errors.lastName}
                    required
                  />
                </Grid>
                <Grid item xs={12}>
                  <Input
                    name="email"
                    label="Email"
                    value={formik.values.email}
                    onChange={formik.handleChange}
                    error={formik.touched.email && Boolean(formik.errors.email)}
                    helperText={formik.touched.email && formik.errors.email}
                    required
                    type="email"
                  />
                </Grid>
                <Grid item xs={12}>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={!formik.isValid || formik.isSubmitting}
                    aria-label="Update profile"
                  >
                    Update Profile
                  </Button>
                </Grid>
              </Grid>
            </form>
          </CardContent>
        </Card>
      </Grid>

      {/* Security settings */}
      <Grid item xs={12} md={4}>
        <Card>
          <CardContent>
            <Typography variant="h5" component="h2" gutterBottom>
              Security Settings
            </Typography>
            {!user.isMfaEnabled ? (
              <Button
                variant="contained"
                color="secondary"
                onClick={handleMfaSetup}
                disabled={state.isLoading}
                aria-label="Setup two-factor authentication"
              >
                Setup 2FA
              </Button>
            ) : (
              <Alert severity="success">
                Two-factor authentication is enabled
              </Alert>
            )}

            {/* MFA setup dialog content */}
            {state.mfaSetupData && (
              <Grid container spacing={2} sx={{ mt: 2 }}>
                <Grid item xs={12}>
                  <Typography variant="body1" gutterBottom>
                    Scan the QR code with your authenticator app
                  </Typography>
                  <img
                    src={state.mfaSetupData.qrCode}
                    alt="MFA QR Code"
                    style={{ width: '200px', height: '200px' }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Input
                    name="mfaToken"
                    label="Verification Code"
                    onChange={(e) => handleMfaVerify(e.target.value)}
                    disabled={state.isMfaVerifying}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                  />
                </Grid>
              </Grid>
            )}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

export default Profile;