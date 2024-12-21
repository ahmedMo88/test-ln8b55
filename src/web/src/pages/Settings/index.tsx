/**
 * @fileoverview Settings page component implementing Material Design 3.0 specifications
 * with comprehensive security, accessibility, and theme management features.
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box,
  Typography,
  Switch,
  TextField,
  Button,
  Divider,
  CircularProgress,
  Alert,
} from '@mui/material';
import { styled } from '@mui/material/styles';

// Internal imports
import MainLayout from '../../components/layout/MainLayout';
import Card from '../../components/common/Card';
import { useAuth } from '../../hooks/useAuth';
import { setThemeMode } from '../../store/slices/uiSlice';
import { THEME_MODE } from '../../constants/theme';

// Styled components
const SettingsContainer = styled(Box)(({ theme }) => ({
  maxWidth: '800px',
  margin: '0 auto',
  padding: theme.spacing(3),
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(2),
  },
}));

const SettingSection = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(4),
}));

const SettingRow = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing(2, 0),
  gap: theme.spacing(2),
  [theme.breakpoints.down('sm')]: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
}));

// Interface for settings form data
interface SettingsFormData {
  displayName: string;
  email: string;
  emailNotifications: boolean;
  darkMode: boolean;
  useSystemTheme: boolean;
}

/**
 * Settings page component providing user preferences management with
 * comprehensive security and accessibility features.
 */
const Settings: React.FC = React.memo(() => {
  const dispatch = useDispatch();
  const { user, isAuthenticated, checkAuth } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formDirty, setFormDirty] = useState(false);

  // Form state
  const [formData, setFormData] = useState<SettingsFormData>({
    displayName: user?.firstName || '',
    email: user?.email || '',
    emailNotifications: true,
    darkMode: false,
    useSystemTheme: true,
  });

  // Initialize form data when user data is available
  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        displayName: user.firstName,
        email: user.email,
      }));
    }
  }, [user]);

  // Security check for authentication
  useEffect(() => {
    if (!isAuthenticated) {
      checkAuth();
    }
  }, [isAuthenticated, checkAuth]);

  /**
   * Handles form submission with validation and error handling
   */
  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!isAuthenticated) {
      setError('Authentication required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Validate form data
      if (!formData.displayName.trim()) {
        throw new Error('Display name is required');
      }

      // API call would go here
      await new Promise(resolve => setTimeout(resolve, 1000));

      setSuccess('Settings updated successfully');
      setFormDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setLoading(false);
    }
  }, [formData, isAuthenticated]);

  /**
   * Handles theme preference changes with system detection
   */
  const handleThemeToggle = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const { checked, name } = event.target;

    if (name === 'useSystemTheme') {
      setFormData(prev => ({ ...prev, useSystemTheme: checked }));
      if (checked) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        dispatch(setThemeMode(prefersDark ? THEME_MODE.DARK : THEME_MODE.LIGHT));
      }
    } else {
      setFormData(prev => ({ ...prev, darkMode: checked }));
      dispatch(setThemeMode(checked ? THEME_MODE.DARK : THEME_MODE.LIGHT));
    }

    setFormDirty(true);
  }, [dispatch]);

  /**
   * Handles form field changes with validation
   */
  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked, type } = event.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setFormDirty(true);
  }, []);

  return (
    <MainLayout>
      <SettingsContainer>
        <Typography variant="h4" component="h1" gutterBottom>
          Settings
        </Typography>

        {/* Error/Success alerts */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Card>
            {/* Profile Settings */}
            <SettingSection>
              <Typography variant="h6" gutterBottom>
                Profile Settings
              </Typography>
              <SettingRow>
                <TextField
                  name="displayName"
                  label="Display Name"
                  value={formData.displayName}
                  onChange={handleInputChange}
                  fullWidth
                  required
                  disabled={loading}
                  inputProps={{
                    'aria-label': 'Display name',
                    maxLength: 50,
                  }}
                />
              </SettingRow>
              <SettingRow>
                <TextField
                  name="email"
                  label="Email"
                  value={formData.email}
                  onChange={handleInputChange}
                  fullWidth
                  required
                  disabled={loading}
                  type="email"
                  inputProps={{
                    'aria-label': 'Email address',
                  }}
                />
              </SettingRow>
            </SettingSection>

            <Divider />

            {/* Notification Settings */}
            <SettingSection>
              <Typography variant="h6" gutterBottom>
                Notification Settings
              </Typography>
              <SettingRow>
                <Typography>Email Notifications</Typography>
                <Switch
                  name="emailNotifications"
                  checked={formData.emailNotifications}
                  onChange={handleInputChange}
                  disabled={loading}
                  inputProps={{
                    'aria-label': 'Toggle email notifications',
                  }}
                />
              </SettingRow>
            </SettingSection>

            <Divider />

            {/* Theme Settings */}
            <SettingSection>
              <Typography variant="h6" gutterBottom>
                Theme Settings
              </Typography>
              <SettingRow>
                <Typography>Use System Theme</Typography>
                <Switch
                  name="useSystemTheme"
                  checked={formData.useSystemTheme}
                  onChange={handleThemeToggle}
                  disabled={loading}
                  inputProps={{
                    'aria-label': 'Use system theme',
                  }}
                />
              </SettingRow>
              <SettingRow>
                <Typography>Dark Mode</Typography>
                <Switch
                  name="darkMode"
                  checked={formData.darkMode}
                  onChange={handleThemeToggle}
                  disabled={loading || formData.useSystemTheme}
                  inputProps={{
                    'aria-label': 'Toggle dark mode',
                  }}
                />
              </SettingRow>
            </SettingSection>

            {/* Form Actions */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
              <Button
                variant="outlined"
                onClick={() => window.location.reload()}
                disabled={loading || !formDirty}
              >
                Reset
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={loading || !formDirty}
                startIcon={loading && <CircularProgress size={20} />}
              >
                Save Changes
              </Button>
            </Box>
          </Card>
        </form>
      </SettingsContainer>
    </MainLayout>
  );
});

Settings.displayName = 'Settings';

export default Settings;