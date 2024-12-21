/**
 * @fileoverview Integration configuration form component implementing Material Design 3.0
 * with comprehensive validation, OAuth flow handling, and accessibility features.
 * @version 1.0.0
 */

import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { styled } from '@mui/material/styles';
import { 
  Card, 
  CardContent, 
  CircularProgress, 
  Alert, 
  Snackbar,
  FormControl,
  FormHelperText,
  Typography,
  Divider
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { useErrorBoundary } from 'react-error-boundary';

// Internal imports
import Input from '../../common/Input';
import Button from '../../common/Button';
import { 
  ServiceType, 
  AuthType, 
  IntegrationConfig, 
  Integration 
} from '../../../types/integration.types';
import IntegrationService from '../../../services/integration.service';

// Styled components
const FormContainer = styled(Card)(({ theme }) => ({
  maxWidth: '600px',
  margin: '24px auto',
  padding: '24px',
  boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.1)',
  borderRadius: '8px',
  backgroundColor: theme.palette.background.paper,
}));

const FormActions = styled('div')(({ theme }) => ({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: theme.spacing(2),
  marginTop: theme.spacing(3),
}));

const ErrorMessage = styled(Typography)(({ theme }) => ({
  color: theme.palette.error.main,
  fontSize: '0.875rem',
  marginTop: theme.spacing(1),
}));

// Validation schema using zod
const validationSchema = z.object({
  serviceType: z.nativeEnum(ServiceType),
  authType: z.nativeEnum(AuthType),
  settings: z.record(z.any()),
  rateLimits: z.object({
    requestsPerMinute: z.number().min(1),
    burstLimit: z.number().optional(),
    cooldownPeriod: z.number().optional()
  })
});

// Props interface
interface IntegrationFormProps {
  initialValues?: IntegrationConfig;
  onSubmit: (config: IntegrationConfig) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  error?: Error;
}

/**
 * Integration configuration form component with comprehensive validation
 * and OAuth flow handling
 */
export const IntegrationForm: React.FC<IntegrationFormProps> = ({
  initialValues,
  onSubmit,
  onCancel,
  isLoading = false,
  error
}) => {
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const { showBoundary } = useErrorBoundary();
  const integrationService = useMemo(() => new IntegrationService(), []);

  // Form initialization with react-hook-form
  const { 
    control, 
    handleSubmit, 
    watch, 
    formState: { errors, isSubmitting },
    reset 
  } = useForm<IntegrationConfig>({
    defaultValues: initialValues || {
      serviceType: ServiceType.EMAIL,
      authType: AuthType.OAUTH2,
      settings: {},
      rateLimits: {
        requestsPerMinute: 100
      }
    }
  });

  // Watch for service type changes to update available auth types
  const serviceType = watch('serviceType');

  // Get available auth types for selected service
  const getAvailableAuthTypes = useCallback((service: ServiceType): AuthType[] => {
    const authMap: Record<ServiceType, AuthType[]> = {
      [ServiceType.EMAIL]: [AuthType.OAUTH2],
      [ServiceType.CLOUD_STORAGE]: [AuthType.OAUTH2, AuthType.API_KEY],
      [ServiceType.PROJECT_MANAGEMENT]: [AuthType.OAUTH2, AuthType.API_KEY],
      [ServiceType.COMMUNICATION]: [AuthType.OAUTH2],
      [ServiceType.AI_SERVICE]: [AuthType.API_KEY]
    };
    return authMap[service] || [];
  }, []);

  // Handle form submission
  const handleFormSubmit = async (data: IntegrationConfig) => {
    try {
      // Validate data against schema
      validationSchema.parse(data);
      
      // Validate connection
      await integrationService.validateConnection(data);
      
      // Submit form
      await onSubmit(data);
      
      setSnackbarMessage('Integration configured successfully');
      setShowSnackbar(true);
    } catch (error) {
      console.error('Integration form error:', error);
      showBoundary(error);
    }
  };

  // Reset form when initial values change
  useEffect(() => {
    if (initialValues) {
      reset(initialValues);
    }
  }, [initialValues, reset]);

  return (
    <FormContainer>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Configure Integration
        </Typography>
        <Divider sx={{ mb: 3 }} />

        <form onSubmit={handleSubmit(handleFormSubmit)} noValidate>
          {/* Service Type Selection */}
          <Controller
            name="serviceType"
            control={control}
            rules={{ required: 'Service type is required' }}
            render={({ field }) => (
              <FormControl fullWidth margin="normal">
                <Input
                  {...field}
                  label="Service Type"
                  select
                  required
                  error={!!errors.serviceType}
                  helperText={errors.serviceType?.message}
                  options={Object.values(ServiceType)}
                />
              </FormControl>
            )}
          />

          {/* Auth Type Selection */}
          <Controller
            name="authType"
            control={control}
            rules={{ required: 'Authentication type is required' }}
            render={({ field }) => (
              <FormControl fullWidth margin="normal">
                <Input
                  {...field}
                  label="Authentication Type"
                  select
                  required
                  error={!!errors.authType}
                  helperText={errors.authType?.message}
                  options={getAvailableAuthTypes(serviceType)}
                />
              </FormControl>
            )}
          />

          {/* Rate Limits Configuration */}
          <Controller
            name="rateLimits.requestsPerMinute"
            control={control}
            rules={{ 
              required: 'Rate limit is required',
              min: { value: 1, message: 'Minimum rate limit is 1' }
            }}
            render={({ field }) => (
              <FormControl fullWidth margin="normal">
                <Input
                  {...field}
                  type="number"
                  label="Requests per Minute"
                  required
                  error={!!errors.rateLimits?.requestsPerMinute}
                  helperText={errors.rateLimits?.requestsPerMinute?.message}
                />
              </FormControl>
            )}
          />

          {/* Error Display */}
          {error && (
            <ErrorMessage role="alert">
              {error.message}
            </ErrorMessage>
          )}

          {/* Form Actions */}
          <FormActions>
            <Button
              variant="outlined"
              onClick={onCancel}
              disabled={isLoading || isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              loading={isLoading || isSubmitting}
              disabled={isLoading || isSubmitting}
            >
              Save Integration
            </Button>
          </FormActions>
        </form>
      </CardContent>

      {/* Success/Error Snackbar */}
      <Snackbar
        open={showSnackbar}
        autoHideDuration={6000}
        onClose={() => setShowSnackbar(false)}
      >
        <Alert 
          onClose={() => setShowSnackbar(false)} 
          severity="success"
          elevation={6}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </FormContainer>
  );
};

export default IntegrationForm;