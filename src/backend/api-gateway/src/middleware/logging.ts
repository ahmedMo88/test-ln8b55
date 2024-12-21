import express, { Request, Response, NextFunction, RequestHandler } from 'express'; // ^4.18.0
import winston, { Logger, format } from 'winston'; // ^3.8.0
import morgan from 'morgan'; // ^1.10.0
import { v4 as uuidv4 } from 'uuid'; // ^9.0.0
import { injectable } from 'inversify';

// Extended Request interface with tracking metadata
interface RequestWithId extends Request {
  id: string;
  timestamp: string;
  correlationId: string;
  parentRequestId?: string;
  metrics: {
    startTime: number;
    endTime?: number;
    processingTime?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
}

// Comprehensive log metadata structure
interface LogMetadata {
  requestId: string;
  correlationId: string;
  method: string;
  url: string;
  userAgent: string;
  ip: string;
  responseTime: number;
  statusCode: number;
  requestHeaders: Record<string, unknown>;
  responseHeaders: Record<string, unknown>;
  performanceMetrics: {
    processingTime: number;
    memoryUsage: number;
    cpuUsage: number;
  };
  securityMetadata: {
    authenticated: boolean;
    authMethod?: string;
    userRole?: string;
    ipLocation?: string;
  };
}

// Log levels configuration
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
  trace: 5,
};

// Logging format configuration
const LOG_FORMAT = {
  timestamp: true,
  json: true,
  colorize: false,
  prettyPrint: false,
  maxArrayLength: 1000,
  maxStringLength: 10000,
  sanitize: true,
  maskSecrets: true,
};

// Sensitive data patterns for masking
const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /key/i,
  /secret/i,
  /authorization/i,
  /credential/i,
];

/**
 * Creates and configures an advanced Winston logger instance
 * @param config Logger configuration options
 * @returns Configured Winston logger instance
 */
@injectable()
const createLogger = (config: Record<string, unknown> = {}): Logger => {
  // Custom formatter for masking sensitive data
  const maskSecrets = format((info) => {
    const masked = { ...info };
    const mask = (obj: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && SENSITIVE_PATTERNS.some(pattern => pattern.test(key))) {
          obj[key] = '********';
        } else if (typeof value === 'object' && value !== null) {
          mask(value as Record<string, unknown>);
        }
      }
    };
    mask(masked);
    return masked;
  });

  // Configure Winston logger
  return winston.createLogger({
    levels: LOG_LEVELS,
    format: format.combine(
      format.timestamp(),
      format.json(),
      maskSecrets(),
      format.errors({ stack: true }),
    ),
    transports: [
      new winston.transports.Console({
        level: process.env.LOG_LEVEL || 'info',
        handleExceptions: true,
      }),
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
    ],
    exitOnError: false,
  });
};

// Create logger instance
export const logger = createLogger();

/**
 * Advanced request logging middleware
 * Provides comprehensive request/response logging with performance metrics
 */
export const requestLogger: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const requestWithId = req as RequestWithId;
  
  // Generate request tracking IDs
  requestWithId.id = uuidv4();
  requestWithId.correlationId = req.headers['x-correlation-id'] as string || uuidv4();
  requestWithId.parentRequestId = req.headers['x-parent-request-id'] as string;
  requestWithId.timestamp = new Date().toISOString();
  
  // Initialize metrics tracking
  requestWithId.metrics = {
    startTime: process.hrtime()[0],
    memoryUsage: process.memoryUsage().heapUsed,
    cpuUsage: process.cpuUsage().user,
  };

  // Capture original response methods
  const originalEnd = res.end;
  const originalWrite = res.write;
  let responseBody = '';

  // Intercept response body
  res.write = function(chunk: any, ...args: any[]): boolean {
    responseBody += chunk;
    return originalWrite.apply(res, [chunk, ...args]);
  };

  // Handle response completion
  res.end = function(...args: any[]): void {
    const endTime = process.hrtime()[0];
    const processingTime = endTime - requestWithId.metrics.startTime;
    
    // Calculate final metrics
    const metrics = {
      processingTime,
      memoryUsage: process.memoryUsage().heapUsed - requestWithId.metrics.memoryUsage!,
      cpuUsage: process.cpuUsage().user - requestWithId.metrics.cpuUsage!,
    };

    // Compile log metadata
    const logMetadata: LogMetadata = {
      requestId: requestWithId.id,
      correlationId: requestWithId.correlationId,
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'] || 'unknown',
      ip: req.ip,
      responseTime: processingTime,
      statusCode: res.statusCode,
      requestHeaders: sanitizeHeaders(req.headers),
      responseHeaders: sanitizeHeaders(res.getHeaders()),
      performanceMetrics: metrics,
      securityMetadata: {
        authenticated: !!req.headers.authorization,
        authMethod: req.headers.authorization ? 'Bearer' : undefined,
        userRole: (req as any).user?.role,
        ipLocation: (req as any).ipLocation,
      },
    };

    // Log request completion
    logger.info('Request completed', { metadata: logMetadata });

    // Call original end method
    originalEnd.apply(res, args);
  };

  // Log incoming request
  logger.info('Request received', {
    requestId: requestWithId.id,
    method: req.method,
    url: req.url,
    correlationId: requestWithId.correlationId,
    parentRequestId: requestWithId.parentRequestId,
  });

  next();
};

/**
 * Sanitizes headers by removing sensitive information
 * @param headers Headers object to sanitize
 * @returns Sanitized headers object
 */
const sanitizeHeaders = (headers: Record<string, unknown>): Record<string, unknown> => {
  const sanitized = { ...headers };
  SENSITIVE_PATTERNS.forEach(pattern => {
    Object.keys(sanitized).forEach(key => {
      if (pattern.test(key)) {
        sanitized[key] = '********';
      }
    });
  });
  return sanitized;
};

// Error handling for the logger
logger.on('error', (error) => {
  console.error('Logging error:', error);
});

// Export configured logger instance
export { Logger };