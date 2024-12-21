/**
 * @fileoverview Enterprise-grade CORS configuration for API Gateway service
 * @version 1.0.0
 * @license MIT
 * 
 * Implements secure CORS policies with:
 * - Strict origin validation
 * - Comprehensive security headers
 * - TLS enforcement
 * - Security monitoring
 * - Cache control
 */

import cors from 'cors'; // v2.8.5 - Enterprise CORS middleware

// Environment-specific CORS configuration
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
export const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
export const MAX_AGE = 86400; // 24 hours in seconds
export const CORS_CACHE_DURATION = 3600; // 1 hour in seconds
export const STRICT_SSL = process.env.NODE_ENV === 'production';

// Cache for origin validation results
const originValidationCache = new Map<string, { isValid: boolean; timestamp: number }>();

/**
 * Enhanced origin validation with pattern matching and security monitoring
 * @param origin - Origin to validate
 * @param options - Validation options
 * @returns boolean indicating if origin is allowed
 */
export const validateOrigin = (origin: string, options: { enableCache?: boolean } = {}): boolean => {
  if (!origin) return false;

  // Check cache if enabled
  if (options.enableCache) {
    const cached = originValidationCache.get(origin);
    if (cached && Date.now() - cached.timestamp < CORS_CACHE_DURATION * 1000) {
      return cached.isValid;
    }
  }

  try {
    const url = new URL(origin);
    
    // Validate origin format
    if (!url.protocol || !url.host) {
      return false;
    }

    // Check against allowed origins
    const isAllowed = ALLOWED_ORIGINS.some(allowed => {
      if (allowed.includes('*')) {
        // Handle wildcard patterns
        const pattern = new RegExp('^' + allowed.replace('*', '.*') + '$');
        return pattern.test(origin);
      }
      return allowed === origin;
    });

    // Cache result if enabled
    if (options.enableCache) {
      originValidationCache.set(origin, {
        isValid: isAllowed,
        timestamp: Date.now()
      });
    }

    // Log validation for security monitoring
    if (!isAllowed) {
      console.warn(`CORS: Rejected origin attempt from ${origin}`);
    }

    return isAllowed;
  } catch (error) {
    console.error(`CORS: Origin validation error for ${origin}:`, error);
    return false;
  }
};

/**
 * Generates comprehensive security headers for CORS responses
 * @returns Security headers configuration object
 */
export const getSecurityHeaders = () => {
  const headers: Record<string, string> = {
    'Strict-Transport-Security': `max-age=${MAX_AGE}; includeSubDomains; preload`,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  };

  if (STRICT_SSL) {
    headers['Expect-CT'] = `max-age=${MAX_AGE}, enforce`;
  }

  return headers;
};

/**
 * Creates and returns comprehensive CORS configuration options
 * @returns Enhanced CORS configuration options
 */
export const getCorsConfig = (): cors.CorsOptions => {
  return {
    origin: (origin, callback) => {
      // Skip origin check for same-origin requests
      if (!origin) {
        callback(null, true);
        return;
      }

      if (validateOrigin(origin, { enableCache: true })) {
        callback(null, true);
      } else {
        callback(new Error('CORS: Origin not allowed'));
      }
    },
    methods: ALLOWED_METHODS,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'X-CSRF-Token'
    ],
    exposedHeaders: [
      'Content-Length',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset'
    ],
    credentials: true,
    maxAge: MAX_AGE,
    preflightContinue: false,
    optionsSuccessStatus: 204,
    
    // Custom success handler to add security headers
    successHandler: (req, res) => {
      const securityHeaders = getSecurityHeaders();
      Object.entries(securityHeaders).forEach(([header, value]) => {
        res.setHeader(header, value);
      });
    }
  };
};