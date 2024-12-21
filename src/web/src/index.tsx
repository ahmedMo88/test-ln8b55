/**
 * @fileoverview Application entry point that bootstraps the React application with Redux store,
 * Material UI theme provider, and proper error handling.
 * @version 1.0.0
 */

import React from 'react'; // v18.2.0
import { createRoot } from 'react-dom/client'; // v18.2.0
import { Provider } from 'react-redux'; // v8.1.0
import { ThemeProvider, CssBaseline } from '@mui/material'; // v5.14.0
import * as Sentry from '@sentry/react'; // v7.0.0

// Internal imports
import App from './App';
import { store } from './store';
import { createAppTheme } from './theme';
import { THEME_MODE } from './constants/theme';

// Constants
const ROOT_ELEMENT_ID = 'root';
const APP_VERSION = process.env.REACT_APP_VERSION || '1.0.0';

// Initialize error tracking
if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: process.env.REACT_APP_SENTRY_DSN,
    environment: process.env.REACT_APP_ENVIRONMENT,
    release: APP_VERSION,
    tracesSampleRate: 0.2,
    integrations: [
      new Sentry.BrowserTracing({
        tracingOrigins: ['localhost', process.env.REACT_APP_API_URL || '']
      })
    ]
  });
}

/**
 * Configures security headers for the application
 */
const configureSecurityHeaders = (): void => {
  // Set security headers if not already set by server
  if (!document.head.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
    const cspMeta = document.createElement('meta');
    cspMeta.httpEquiv = 'Content-Security-Policy';
    cspMeta.content = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      `connect-src 'self' ${process.env.REACT_APP_API_URL || ''} ${process.env.REACT_APP_WS_URL || ''}`,
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests"
    ].join('; ');
    document.head.appendChild(cspMeta);
  }
};

/**
 * Handles cleanup on application unmount
 */
const cleanup = (): void => {
  // Unregister service workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(registration => registration.unregister());
    });
  }

  // Remove event listeners
  window.removeEventListener('unhandledrejection', handleUnhandledRejection);
};

/**
 * Handles unhandled promise rejections
 */
const handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
  console.error('Unhandled promise rejection:', event.reason);
  Sentry.captureException(event.reason);
};

/**
 * Bootstraps and renders the React application
 */
const renderApp = (): void => {
  // Configure security headers
  configureSecurityHeaders();

  // Get root element
  const rootElement = document.getElementById(ROOT_ELEMENT_ID);
  if (!rootElement) {
    throw new Error(`Element with id '${ROOT_ELEMENT_ID}' not found`);
  }

  // Create React root
  const root = createRoot(rootElement);

  // Set up error handling
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  // Create initial theme
  const theme = createAppTheme(THEME_MODE.LIGHT);

  // Render application
  root.render(
    <React.StrictMode>
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <App />
        </ThemeProvider>
      </Provider>
    </React.StrictMode>
  );

  // Register cleanup
  window.addEventListener('unload', cleanup);
};

// Initialize application
try {
  renderApp();
} catch (error) {
  console.error('Failed to initialize application:', error);
  Sentry.captureException(error);
  
  // Display fallback error UI
  const rootElement = document.getElementById(ROOT_ELEMENT_ID);
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <h1>Application Error</h1>
        <p>We're sorry, but something went wrong. Please try refreshing the page.</p>
      </div>
    `;
  }
}