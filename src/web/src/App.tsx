/**
 * @fileoverview Root application component implementing Material Design 3.0 specifications
 * with comprehensive authentication, theme management, and state management integration.
 * @version 1.0.0
 */

import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ThemeProvider, CssBaseline, useMediaQuery } from '@mui/material';
import { ErrorBoundary } from 'react-error-boundary';

// Internal imports
import MainLayout from './components/layout/MainLayout';
import LoginPage from './pages/Login';
import { useAuth } from './hooks/useAuth';
import { store } from './store';

// Lazy-loaded components for code splitting
const DashboardPage = React.lazy(() => import('./pages/Dashboard'));
const WorkflowsPage = React.lazy(() => import('./pages/Workflows'));
const IntegrationsPage = React.lazy(() => import('./pages/Integrations'));
const SettingsPage = React.lazy(() => import('./pages/Settings'));

/**
 * Props interface for protected route component
 */
interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectPath?: string;
  allowedRoles?: string[];
}

/**
 * Enhanced higher-order component that protects routes requiring authentication
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  redirectPath = '/auth/login',
  allowedRoles = []
}) => {
  const location = useLocation();
  const { isAuthenticated, user, checkAuthStatus } = useAuth();

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Check authentication and role-based access
  if (!isAuthenticated) {
    // Store attempted URL for post-login redirect
    sessionStorage.setItem('redirectUrl', location.pathname);
    return <Navigate to={redirectPath} replace />;
  }

  // Verify role-based access if roles are specified
  if (allowedRoles.length > 0 && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};

/**
 * Error fallback component for error boundary
 */
const ErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <div role="alert">
    <h2>Something went wrong:</h2>
    <pre style={{ color: 'red' }}>{error.message}</pre>
  </div>
);

/**
 * Loading fallback component for Suspense
 */
const LoadingFallback: React.FC = () => (
  <div role="progressbar" aria-label="Loading content">
    Loading...
  </div>
);

/**
 * Root application component providing core application structure and providers
 */
export const App: React.FC = () => {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Provider store={store}>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </Provider>
    </ErrorBoundary>
  );
};

/**
 * Main application content with theme and layout management
 */
const AppContent: React.FC = () => {
  const { theme, isDarkMode } = useTheme();
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');

  // Sync theme with system preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      // Update theme based on system preference if not manually set
      if (!localStorage.getItem('theme')) {
        setThemeMode(mediaQuery.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [prefersDarkMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <MainLayout>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            {/* Public routes */}
            <Route path="/auth/login" element={<LoginPage />} />

            {/* Protected routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/workflows/*"
              element={
                <ProtectedRoute allowedRoles={['admin', 'developer']}>
                  <WorkflowsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/integrations/*"
              element={
                <ProtectedRoute allowedRoles={['admin', 'developer']}>
                  <IntegrationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/*"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />

            {/* Fallback route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </MainLayout>
    </ThemeProvider>
  );
};

export default App;