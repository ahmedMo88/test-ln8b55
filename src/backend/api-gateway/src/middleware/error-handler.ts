// Express error middleware types and request handling - v4.18.0
import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
// Standardized HTTP status codes for error responses - v2.2.0
import { StatusCodes, ReasonPhrases } from 'http-status-codes';
// Advanced logging service for error tracking and monitoring - v3.8.0
import winston from 'winston';
// Generate unique request IDs for error tracing - v9.0.0
import { v4 as uuidv4 } from 'uuid';

// Constants for error handling
export const DEFAULT_ERROR_MESSAGE = 'Internal Server Error';

export const ERROR_TYPES = {
  VALIDATION: 'ValidationError',
  AUTHENTICATION: 'AuthenticationError',
  AUTHORIZATION: 'AuthorizationError',
  NOT_FOUND: 'NotFoundError',
  CONFLICT: 'ConflictError',
  INTERNAL: 'InternalError',
  NETWORK: 'NetworkError',
  TIMEOUT: 'TimeoutError',
  RATE_LIMIT: 'RateLimitError'
} as const;

export const ERROR_SEVERITY_LEVELS = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
} as const;

// Interface for standardized error response
interface ErrorResponse {
  success: boolean;
  message: string;
  statusCode: number;
  details?: Record<string, any>;
  requestId: string;
  timestamp: string;
  traceId?: string;
  environment: string;
}

// Enhanced custom error class
export class ApiError extends Error {
  public readonly name: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;
  public readonly requestId: string;
  public readonly isOperational: boolean;
  public readonly timestamp: string;

  constructor(
    message: string,
    statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR,
    details?: Record<string, any>,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.requestId = uuidv4();
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

// Configure Winston logger
const logger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Enhanced error classification system
export function isOperationalError(error: Error): boolean {
  if (error instanceof ApiError) {
    return error.isOperational;
  }

  // Classify known error types
  const knownErrors = [
    'ValidationError',
    'TokenExpiredError',
    'JsonWebTokenError',
    'SyntaxError'
  ];

  return knownErrors.includes(error.name);
}

// Sanitize error message for security
function sanitizeErrorMessage(message: string): string {
  // Remove sensitive information patterns
  const sensitivePatterns = [
    /password/gi,
    /token/gi,
    /key/gi,
    /secret/gi,
    /credential/gi
  ];

  let sanitizedMessage = message;
  sensitivePatterns.forEach(pattern => {
    sanitizedMessage = sanitizedMessage.replace(pattern, '[REDACTED]');
  });

  return sanitizedMessage;
}

// Express error handling middleware
export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Generate or retrieve request ID
  const requestId = req.headers['x-request-id'] as string || uuidv4();

  // Determine error type and status code
  const statusCode = err instanceof ApiError 
    ? err.statusCode 
    : StatusCodes.INTERNAL_SERVER_ERROR;

  // Determine if error is operational
  const isOperational = isOperationalError(err);

  // Prepare error details for logging
  const errorContext = {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body,
    headers: req.headers,
    timestamp: new Date().toISOString(),
    isOperational,
    stack: err.stack
  };

  // Log error with context
  logger.error('API Error:', {
    error: err.message,
    context: errorContext
  });

  // Prepare sanitized error response
  const errorResponse: ErrorResponse = {
    success: false,
    message: sanitizeErrorMessage(err.message) || DEFAULT_ERROR_MESSAGE,
    statusCode,
    requestId,
    timestamp: new Date().toISOString(),
    traceId: req.headers['x-trace-id'] as string,
    environment: process.env.NODE_ENV || 'development'
  };

  // Include error details for non-production environments
  if (process.env.NODE_ENV !== 'production' && err instanceof ApiError) {
    errorResponse.details = err.details;
  }

  // Track error metrics
  if (process.env.NODE_ENV === 'production') {
    // Here you would integrate with your metrics collection system
    // Example: prometheus.incrementCounter('api_errors_total', { type: err.name, status: statusCode });
  }

  // Trigger alerts for critical errors
  if (!isOperational || statusCode >= StatusCodes.INTERNAL_SERVER_ERROR) {
    // Here you would integrate with your alerting system
    // Example: alerting.triggerAlert('CriticalApiError', { error: errorContext });
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
};

// Export types for external use
export type { ErrorResponse };