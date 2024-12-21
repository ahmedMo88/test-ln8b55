/**
 * @fileoverview Comprehensive test suite for IntegrationForm component validating
 * form rendering, validation, submission, accessibility and integration configuration.
 * @version 1.0.0
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import IntegrationForm from '../../../components/integration/Form';
import { 
  ServiceType, 
  AuthType, 
  IntegrationConfig, 
  RateLimitConfig 
} from '../../../types/integration.types';

// Mock data for testing
const validIntegrationConfigs: Record<ServiceType, IntegrationConfig> = {
  [ServiceType.EMAIL]: {
    serviceType: ServiceType.EMAIL,
    authType: AuthType.OAUTH2,
    settings: {},
    rateLimits: { requestsPerMinute: 100 }
  },
  [ServiceType.CLOUD_STORAGE]: {
    serviceType: ServiceType.CLOUD_STORAGE,
    authType: AuthType.API_KEY,
    settings: {},
    rateLimits: { requestsPerMinute: 1000 }
  },
  [ServiceType.PROJECT_MANAGEMENT]: {
    serviceType: ServiceType.PROJECT_MANAGEMENT,
    authType: AuthType.OAUTH2,
    settings: {},
    rateLimits: { requestsPerMinute: 500 }
  },
  [ServiceType.COMMUNICATION]: {
    serviceType: ServiceType.COMMUNICATION,
    authType: AuthType.OAUTH2,
    settings: {},
    rateLimits: { requestsPerMinute: 200 }
  },
  [ServiceType.AI_SERVICE]: {
    serviceType: ServiceType.AI_SERVICE,
    authType: AuthType.API_KEY,
    settings: {},
    rateLimits: { requestsPerMinute: 60 }
  }
};

const invalidIntegrationConfigs = {
  missingRateLimits: {
    serviceType: ServiceType.EMAIL,
    authType: AuthType.OAUTH2,
    settings: {},
    rateLimits: {}
  },
  invalidAuthType: {
    serviceType: ServiceType.EMAIL,
    authType: AuthType.API_KEY, // EMAIL only supports OAuth2
    settings: {},
    rateLimits: { requestsPerMinute: 100 }
  }
};

describe('IntegrationForm', () => {
  // Mock handlers
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Form Rendering', () => {
    it('renders all form fields correctly', () => {
      render(
        <IntegrationForm
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // Verify required form elements
      expect(screen.getByLabelText(/service type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/authentication type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/requests per minute/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save integration/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('shows appropriate auth types based on service selection', async () => {
      render(
        <IntegrationForm
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // Select EMAIL service type
      const serviceSelect = screen.getByLabelText(/service type/i);
      await user.click(serviceSelect);
      await user.selectOptions(serviceSelect, ServiceType.EMAIL);

      // Verify only OAuth2 is available for EMAIL
      const authSelect = screen.getByLabelText(/authentication type/i);
      expect(within(authSelect).queryByText(AuthType.API_KEY)).not.toBeInTheDocument();
      expect(within(authSelect).getByText(AuthType.OAUTH2)).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('validates required fields', async () => {
      render(
        <IntegrationForm
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // Try to submit empty form
      const submitButton = screen.getByRole('button', { name: /save integration/i });
      await user.click(submitButton);

      // Verify validation messages
      expect(await screen.findByText(/service type is required/i)).toBeInTheDocument();
      expect(await screen.findByText(/authentication type is required/i)).toBeInTheDocument();
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('validates rate limit configuration', async () => {
      render(
        <IntegrationForm
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // Set invalid rate limit
      const rateInput = screen.getByLabelText(/requests per minute/i);
      await user.clear(rateInput);
      await user.type(rateInput, '0');

      // Try to submit
      const submitButton = screen.getByRole('button', { name: /save integration/i });
      await user.click(submitButton);

      // Verify validation message
      expect(await screen.findByText(/minimum rate limit is 1/i)).toBeInTheDocument();
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('validates service-specific auth types', async () => {
      render(
        <IntegrationForm
          initialValues={invalidIntegrationConfigs.invalidAuthType}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // Try to submit with invalid auth type
      const submitButton = screen.getByRole('button', { name: /save integration/i });
      await user.click(submitButton);

      // Verify error message
      expect(await screen.findByText(/invalid authentication type/i)).toBeInTheDocument();
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Form Submission', () => {
    it('handles successful submission', async () => {
      render(
        <IntegrationForm
          initialValues={validIntegrationConfigs[ServiceType.EMAIL]}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // Submit valid form
      const submitButton = screen.getByRole('button', { name: /save integration/i });
      await user.click(submitButton);

      // Verify submission
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining(validIntegrationConfigs[ServiceType.EMAIL])
        );
      });

      // Verify success message
      expect(await screen.findByText(/integration configured successfully/i)).toBeInTheDocument();
    });

    it('shows loading state during submission', async () => {
      mockOnSubmit.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

      render(
        <IntegrationForm
          initialValues={validIntegrationConfigs[ServiceType.EMAIL]}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // Submit form
      const submitButton = screen.getByRole('button', { name: /save integration/i });
      await user.click(submitButton);

      // Verify loading state
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(submitButton).toBeDisabled();

      // Wait for submission to complete
      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('maintains focus management', async () => {
      render(
        <IntegrationForm
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // Tab through form elements
      const serviceSelect = screen.getByLabelText(/service type/i);
      const authSelect = screen.getByLabelText(/authentication type/i);
      const rateInput = screen.getByLabelText(/requests per minute/i);
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      const submitButton = screen.getByRole('button', { name: /save integration/i });

      await user.tab();
      expect(serviceSelect).toHaveFocus();

      await user.tab();
      expect(authSelect).toHaveFocus();

      await user.tab();
      expect(rateInput).toHaveFocus();

      await user.tab();
      expect(cancelButton).toHaveFocus();

      await user.tab();
      expect(submitButton).toHaveFocus();
    });

    it('announces validation errors', async () => {
      render(
        <IntegrationForm
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // Submit empty form
      const submitButton = screen.getByRole('button', { name: /save integration/i });
      await user.click(submitButton);

      // Verify error messages are announced
      const errors = await screen.findAllByRole('alert');
      expect(errors.length).toBeGreaterThan(0);
      errors.forEach(error => {
        expect(error).toHaveAttribute('aria-live', 'polite');
      });
    });
  });
});