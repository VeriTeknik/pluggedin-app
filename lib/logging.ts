/**
 * Structured Logging for Node.js/Next.js Services
 *
 * Installation:
 * npm install pino pino-pretty
 *
 * Features:
 * - JSON structured logs for production
 * - Pretty printing for development
 * - Automatic trace ID generation
 * - Log levels: trace, debug, info, warn, error, fatal
 * - Integration with Loki via Promtail
 */

import pino from 'pino';
import { randomUUID } from 'crypto';

// Determine environment
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Create logger instance
export const logger = pino({
  name: process.env.APP_NAME || 'pluggedin-service',
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),

  // Base metadata added to all logs
  base: {
    service: process.env.SERVICE_NAME || 'pluggedin-service',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '1.0.0',
    hostname: process.env.HOSTNAME || require('os').hostname(),
  },

  // Timestamp format
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,

  // Format for development (pretty print)
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    },
  }),

  // Redact sensitive fields
  redact: {
    paths: [
      'password',
      'apiKey',
      'token',
      'secret',
      'authorization',
      'cookie',
      '*.password',
      '*.apiKey',
      '*.token',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },

  // Serializers for common objects
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

// ========================================
// Context Management
// ========================================

/**
 * Create a child logger with additional context
 *
 * Usage:
 * const requestLogger = createLogger({ requestId: req.id, userId: user.id });
 * requestLogger.info('Processing request');
 */
export function createLogger(context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Generate a trace ID for request tracking
 */
export function generateTraceId(): string {
  return randomUUID();
}

// ========================================
// Express Middleware
// ========================================

import type { Request, Response, NextFunction } from 'express';

/**
 * Express middleware to add request logging
 *
 * Usage:
 * import { loggingMiddleware } from './logging';
 * app.use(loggingMiddleware);
 */
export function loggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const traceId = req.headers['x-trace-id'] as string || generateTraceId();
  const start = Date.now();

  // Create request-scoped logger
  const requestLogger = createLogger({
    trace_id: traceId,
    request_id: traceId,
    method: req.method,
    path: req.path,
    user_agent: req.headers['user-agent'],
    ip: req.ip,
  });

  // Attach logger to request object
  (req as any).logger = requestLogger;

  // Log incoming request
  requestLogger.info({
    msg: 'Incoming request',
    method: req.method,
    url: req.url,
    query: req.query,
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    requestLogger[logLevel]({
      msg: 'Request completed',
      method: req.method,
      url: req.url,
      status_code: res.statusCode,
      duration_ms: duration,
    });
  });

  // Add trace ID to response headers
  res.setHeader('X-Trace-ID', traceId);

  next();
}

// ========================================
// Next.js Integration
// ========================================

/**
 * Next.js middleware to add logging
 *
 * Create file: middleware.ts
 *
 * import { NextRequest, NextResponse } from 'next/server';
 * import { logger, generateTraceId } from '@/lib/logging';
 *
 * export function middleware(request: NextRequest) {
 *   const traceId = request.headers.get('x-trace-id') || generateTraceId();
 *   const start = Date.now();
 *
 *   logger.info({
 *     msg: 'Incoming request',
 *     method: request.method,
 *     path: request.nextUrl.pathname,
 *     trace_id: traceId,
 *   });
 *
 *   const response = NextResponse.next();
 *   response.headers.set('X-Trace-ID', traceId);
 *
 *   return response;
 * }
 */

// ========================================
// Helper Functions
// ========================================

/**
 * Log an error with full stack trace and context
 *
 * Usage:
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
 * Log performance metrics
 *
 * Usage:
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
 * Log with automatic duration tracking
 *
 * Usage:
 * await withLogging('Database query', { table: 'users' }, async () => {
 *   return await db.query('SELECT * FROM users');
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
// Example Usage
// ========================================

/*
// Example 1: Basic logging
import { logger } from '@/lib/logging';

logger.info('Application started');
logger.debug('Debug information', { detail: 'value' });
logger.warn('Warning message', { code: 'WARN_001' });
logger.error('Error occurred', { error: err });

// Example 2: Server actions with logging
'use server';

import { logger, withLogging } from '@/lib/logging';

export async function createDocument(data: FormData) {
  return withLogging('create-document', { docType: 'pdf' }, async () => {
    // ... implementation ...
    logger.info('Document created', { documentId: doc.id });
    return doc;
  });
}

// Example 3: API route with request logger
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const traceId = request.headers.get('x-trace-id') || generateTraceId();
  const log = createLogger({ trace_id: traceId, endpoint: '/api/users' });

  try {
    log.info('Fetching users');
    const users = await db.query.users.findMany();
    log.info('Users fetched', { count: users.length });

    return Response.json(users);
  } catch (error) {
    logError('Failed to fetch users', error, { trace_id: traceId });
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}

// Example 4: Database query logging
import { startTimer } from '@/lib/logging';

async function queryDatabase(sql: string) {
  const timer = startTimer();

  try {
    const result = await db.execute(sql);
    timer.end('Database query completed', {
      query: sql.substring(0, 100),
      rows: result.rowCount,
    });
    return result;
  } catch (error) {
    logError('Database query failed', error, { query: sql });
    throw error;
  }
}

// Example 5: Business logic logging
import { logger } from '@/lib/logging';

export async function processPayment(orderId: string, amount: number) {
  const log = createLogger({ orderId, operation: 'payment' });

  log.info('Starting payment processing', { amount });

  try {
    const payment = await stripe.charge(amount);
    log.info('Payment processed', {
      paymentId: payment.id,
      amount,
      status: payment.status,
    });

    return payment;
  } catch (error) {
    log.error('Payment failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      amount,
    });
    throw error;
  }
}

// Example 6: Background job logging
import { logger, createLogger } from '@/lib/logging';

export async function processBackgroundJob(jobId: string) {
  const log = createLogger({ jobId, job_type: 'email' });

  log.info('Job started');

  try {
    // ... job logic ...
    log.info('Job completed', { duration_ms: 1500 });
  } catch (error) {
    log.error('Job failed', { error });
    throw error;
  }
}
*/

export default logger;
