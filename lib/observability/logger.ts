/**
 * Unified Structured Logging for pluggedin-app
 *
 * This logger consolidates features from lib/logger.ts and lib/logging.ts
 * with full Loki compatibility (JSON output for production).
 *
 * Features:
 * - JSON structured logs for production (Loki-compatible)
 * - Automatic sensitive data redaction
 * - Trace ID generation for request correlation
 * - Specialized loggers: security, API, database
 * - Performance tracking with timers
 * - Child logger contexts
 * - Log levels: trace, debug, info, warn, error, fatal
 *
 * Integration with Loki:
 * - Production logs are pure JSON (no pino-pretty transport)
 * - Logs include service, environment, version metadata
 * - Compatible with Promtail JSON parsing
 */

import pino from 'pino';
import { randomUUID } from 'crypto';

// ========================================
// Environment Detection
// ========================================

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Check if we're in Edge Runtime (where Node.js modules are not available)
// Use try-catch to avoid ReferenceError if EdgeRuntime is not defined
const isEdgeRuntime = (() => {
  try {
    return typeof globalThis.EdgeRuntime !== 'undefined';
  } catch {
    return false;
  }
})();

// ========================================
// Logger Configuration
// ========================================

// Determine log level
const getLogLevel = (): string => {
  if (process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL;
  }

  if (isProduction) return 'info';
  if (isTest) return 'error';
  return 'debug';
};

// Comprehensive sensitive data patterns
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
  'PLUGGEDIN_API_KEY',
  'client_secret',
  'clientSecret',
  'refresh_token',
  'refreshToken',
  'access_token',
  'accessToken',
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.api_key',
  '*.client_secret',
  '*.refresh_token',
  '*.access_token',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

// Create the logger instance
export const logger = pino({
  name: process.env.APP_NAME || 'pluggedin-app',
  level: getLogLevel(),

  // Base metadata added to all logs (for Loki labels)
  base: {
    service: process.env.SERVICE_NAME || 'pluggedin-app',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '2.14.0',
    pid: process.pid,
    // Edge Runtime doesn't support the 'os' module
    hostname: (() => {
      try {
        return isEdgeRuntime ? 'edge-runtime' : require('os').hostname();
      } catch {
        return 'unknown';
      }
    })(),
  },

  // Redact sensitive information
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
    remove: false, // Keep the keys but replace values for debugging
  },

  // Timestamp format (ISO 8601 for Loki)
  timestamp: pino.stdTimeFunctions.isoTime,

  // Format settings
  formatters: {
    level: (label) => {
      return { level: label };
    },
    bindings: (bindings) => {
      return {
        pid: bindings.pid,
        hostname: bindings.hostname,
        service: bindings.service,
        environment: bindings.environment,
        version: bindings.version,
      };
    },
  },

  // IMPORTANT: No pino-pretty transport for Next.js compatibility
  // pino-pretty causes worker.js module not found errors in Next.js
  // Production must be pure JSON for Loki compatibility

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

// ========================================
// Context Management
// ========================================

/**
 * Create a child logger with additional context
 *
 * @example
 * const requestLogger = createLogger({ requestId: req.id, userId: user.id });
 * requestLogger.info('Processing request');
 */
export function createLogger(context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Generate a trace ID for request correlation across services
 * Compatible with OpenTelemetry and Loki tracing
 */
export function generateTraceId(): string {
  return randomUUID();
}

// ========================================
// Specialized Loggers
// ========================================

/**
 * Log security events to audit trail
 * Use for: authentication, authorization, OAuth flows, token operations
 *
 * @example
 * logSecurityEvent('oauth_token_refresh', user.id, { serverUuid, success: true });
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
 * Use in API route handlers and server actions
 *
 * @example
 * logApiRequest('POST', '/api/oauth/token', 200, 150, user.id);
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
    duration_ms: duration,
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
 * Log database operations with performance tracking
 * Use for slow query detection and debugging
 *
 * @example
 * logDatabaseOperation('SELECT', 'users', 250, true);
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
    duration_ms: duration,
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
 * Log OAuth-specific operations
 * Use for OAuth flow tracking, token operations, PKCE validation
 *
 * @example
 * logOAuthEvent('token_refresh', { serverUuid, success: true, reason: 'expired' });
 */
export function logOAuthEvent(
  operation: string,
  metadata: Record<string, any> = {}
) {
  logger.info(
    {
      type: 'OAUTH_EVENT',
      operation,
      metadata,
      timestamp: new Date().toISOString(),
    },
    `OAuth event: ${operation}`
  );
}

// ========================================
// Helper Functions
// ========================================

/**
 * Log an error with full stack trace and context
 * Automatically handles Error objects and unknown types
 *
 * @example
 * try {
 *   // ... code ...
 * } catch (error) {
 *   logError('Failed to process request', error, { userId: user.id });
 * }
 */
export function logError(
  message: string,
  error: Error | unknown,
  context?: Record<string, any>
) {
  logger.error({
    msg: message,
    err: error instanceof Error ? error : new Error(String(error)),
    ...context,
  });
}

/**
 * Create a performance timer
 * Returns an object with an end() method that logs the duration
 *
 * @example
 * const timer = startTimer();
 * await someOperation();
 * timer.end('Operation completed', { operation: 'query' });
 */
export function startTimer() {
  const start = Date.now();

  return {
    end: (message: string, context?: Record<string, any>) => {
      const duration = Date.now() - start;
      logger.info({
        msg: message,
        duration_ms: duration,
        ...context,
      });
      return duration;
    },
  };
}

/**
 * Wrap async operations with automatic logging and duration tracking
 * Logs start, completion, and errors automatically
 *
 * @example
 * await withLogging('Database query', { table: 'users' }, async () => {
 *   return await db.query.users.findMany();
 * });
 */
export async function withLogging<T>(
  operation: string,
  context: Record<string, any>,
  fn: () => Promise<T>
): Promise<T> {
  const timer = startTimer();
  const logContext = { operation, ...context };

  logger.debug({ msg: `Starting ${operation}`, ...logContext });

  try {
    const result = await fn();
    timer.end(`Completed ${operation}`, { ...logContext, status: 'success' });
    return result;
  } catch (error) {
    timer.end(`Failed ${operation}`, { ...logContext, status: 'error' });
    logError(`Error in ${operation}`, error, logContext);
    throw error;
  }
}

// ========================================
// Structured Logging API
// ========================================

/**
 * Main logging interface
 * Provides convenient methods for different log levels and specialized loggers
 */
export const log = {
  // Standard log levels
  trace: (message: string, data?: any) => logger.trace(data, message),
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
  oauth: logOAuthEvent,

  // Helper functions
  withTimer: startTimer,
  withLogging: withLogging,
  logError: logError,

  // Child logger creator
  child: createLogger,

  // Trace ID generation
  traceId: generateTraceId,
};

// ========================================
// Development-Only Debug Logger
// ========================================

/**
 * Debug logger that is no-op in production
 * Use for verbose debugging without impacting production performance
 */
export const debugLog = isProduction
  ? () => {}
  : (message: string, data?: any) => logger.debug(data, message);

// ========================================
// Exports
// ========================================

// Export the raw logger instance for advanced use cases
export { logger as default };

// Re-export for backwards compatibility and convenience
export { logger as rootLogger };
