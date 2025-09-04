/**
 * Centralized logging system with automatic sensitive data redaction
 * Replaces console.log statements throughout the application
 */

import pino from 'pino';

// Determine log level based on environment
const getLogLevel = () => {
  if (process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL;
  }
  
  switch (process.env.NODE_ENV) {
    case 'production':
      return 'info';
    case 'test':
      return 'error';
    default:
      return 'debug';
  }
};

// Patterns to redact sensitive information
const redactPaths = [
  'password',
  'token',
  'secret',
  'api_key',
  'apiKey',
  'authorization',
  'cookie',
  'session',
  'creditCard',
  'ssn',
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.api_key',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

// Create the logger instance
const logger = pino({
  level: getLogLevel(),
  
  // Redact sensitive information
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
    remove: false, // Keep the keys but replace values
  },
  
  // Format settings
  formatters: {
    level: (label) => {
      return { level: label };
    },
    bindings: (bindings) => {
      return {
        pid: bindings.pid,
        hostname: bindings.hostname,
        node_version: process.version,
        app_name: 'pluggedin-app',
      };
    },
  },
  
  // Add timestamp
  timestamp: pino.stdTimeFunctions.isoTime,
  
  // Pretty print in development
  transport: process.env.NODE_ENV !== 'production'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          levelFirst: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  
  // Serializers for common objects
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      query: req.query,
      params: req.params,
      remoteAddress: req.socket?.remoteAddress,
      remotePort: req.socket?.remotePort,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

/**
 * Create a child logger with additional context
 */
export function createLogger(context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Log security events to audit trail
 */
export function logSecurityEvent(
  action: string,
  userId: string | null,
  metadata: Record<string, any> = {}
) {
  logger.info(
    {
      type: 'SECURITY_EVENT',
      action,
      userId,
      metadata,
      timestamp: new Date().toISOString(),
    },
    `Security event: ${action}`
  );
}

/**
 * Log API requests with performance metrics
 */
export function logApiRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  userId?: string
) {
  const logData = {
    type: 'API_REQUEST',
    method,
    path,
    statusCode,
    duration,
    userId,
  };
  
  if (statusCode >= 500) {
    logger.error(logData, `API Error: ${method} ${path}`);
  } else if (statusCode >= 400) {
    logger.warn(logData, `API Client Error: ${method} ${path}`);
  } else {
    logger.info(logData, `API Request: ${method} ${path}`);
  }
}

/**
 * Log database operations
 */
export function logDatabaseOperation(
  operation: string,
  table: string,
  duration: number,
  success: boolean,
  error?: Error
) {
  const logData = {
    type: 'DATABASE_OPERATION',
    operation,
    table,
    duration,
    success,
  };
  
  if (!success && error) {
    logger.error({ ...logData, error }, `Database error: ${operation} on ${table}`);
  } else if (duration > 1000) {
    logger.warn(logData, `Slow database query: ${operation} on ${table}`);
  } else {
    logger.debug(logData, `Database operation: ${operation} on ${table}`);
  }
}

/**
 * Development-only debug logger (no-op in production)
 */
export const debug = process.env.NODE_ENV === 'production' 
  ? () => {} 
  : (message: string, data?: any) => logger.debug(data, message);

/**
 * Structured logging methods
 */
export const log = {
  // Standard log levels
  debug: (message: string, data?: any) => logger.debug(data, message),
  info: (message: string, data?: any) => logger.info(data, message),
  warn: (message: string, data?: any) => logger.warn(data, message),
  error: (message: string, error?: Error | any, data?: any) => {
    if (error instanceof Error) {
      logger.error({ ...data, error }, message);
    } else if (error) {
      logger.error({ ...data, details: error }, message);
    } else {
      logger.error(data, message);
    }
  },
  fatal: (message: string, error?: Error, data?: any) => {
    logger.fatal({ ...data, error }, message);
  },
  
  // Specialized loggers
  security: logSecurityEvent,
  api: logApiRequest,
  database: logDatabaseOperation,
  
  // Child logger creator
  child: createLogger,
};

// Export the raw logger instance for advanced use cases
export { logger };

// Default export for convenience
export default log;