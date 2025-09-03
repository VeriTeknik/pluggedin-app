import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/**
 * Secure error handler that prevents information disclosure
 */

// Error codes for client consumption
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  CONFLICT = 'CONFLICT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

// Map HTTP status codes to generic messages
const STATUS_MESSAGES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Authentication Required',
  403: 'Access Denied',
  404: 'Resource Not Found',
  409: 'Resource Conflict',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Temporarily Unavailable',
};

/**
 * Log error details securely (server-side only)
 */
export function logError(error: unknown, context?: string): void {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (isDevelopment) {
    // In development, log full error details
    console.error(`[${context || 'Error'}]`, error);
  } else {
    // In production, log sanitized error info
    const errorInfo = {
      timestamp: new Date().toISOString(),
      context,
      type: error?.constructor?.name || 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      // Don't log stack traces in production logs that might be accessible
    };
    console.error(JSON.stringify(errorInfo));
  }
}

/**
 * Create a secure error response
 */
export function createSecureErrorResponse(
  error: unknown,
  statusCode: number = 500,
  errorCode?: ErrorCode,
  context?: string
): NextResponse {
  // Log the error server-side
  logError(error, context);
  
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Determine the appropriate error code
  let code = errorCode || ErrorCode.INTERNAL_ERROR;
  let message = STATUS_MESSAGES[statusCode] || 'An error occurred';
  let validationErrors: any[] | undefined;
  
  // Handle specific error types
  if (error instanceof ZodError) {
    code = ErrorCode.VALIDATION_ERROR;
    message = 'Invalid input data';
    // Only include field-level errors, not the actual values
    validationErrors = error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
    }));
  } else if (error instanceof Error) {
    // Check for specific error patterns
    if (error.message.includes('Unauthorized') || error.message.includes('401')) {
      code = ErrorCode.AUTHENTICATION_ERROR;
      statusCode = 401;
      message = STATUS_MESSAGES[401];
    } else if (error.message.includes('Forbidden') || error.message.includes('403')) {
      code = ErrorCode.AUTHORIZATION_ERROR;
      statusCode = 403;
      message = STATUS_MESSAGES[403];
    } else if (error.message.includes('Not found') || error.message.includes('404')) {
      code = ErrorCode.NOT_FOUND;
      statusCode = 404;
      message = STATUS_MESSAGES[404];
    }
  }
  
  // Build the response object
  const responseBody: any = {
    error: {
      code,
      message,
    },
  };
  
  // Add validation errors if present
  if (validationErrors) {
    responseBody.error.validation = validationErrors;
  }
  
  // Only include detailed error info in development
  if (isDevelopment && error instanceof Error) {
    responseBody.error.debug = {
      message: error.message,
      stack: error.stack,
    };
  }
  
  return NextResponse.json(responseBody, { status: statusCode });
}

/**
 * Wrap an API handler with error handling
 */
export function withErrorHandler<T extends (...args: any[]) => Promise<NextResponse>>(
  handler: T,
  context?: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args);
    } catch (error) {
      return createSecureErrorResponse(error, 500, undefined, context);
    }
  }) as T;
}

/**
 * Sanitize error messages for client consumption
 */
export function sanitizeErrorMessage(error: unknown): string {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (isDevelopment && error instanceof Error) {
    return error.message;
  }
  
  // In production, return generic messages
  if (error instanceof ZodError) {
    return 'Invalid input data';
  }
  
  if (error instanceof Error) {
    // Check for safe error patterns
    if (error.message.includes('Unauthorized')) {
      return 'Authentication required';
    }
    if (error.message.includes('Forbidden')) {
      return 'Access denied';
    }
    if (error.message.includes('Not found')) {
      return 'Resource not found';
    }
    if (error.message.includes('already exists')) {
      return 'Resource already exists';
    }
  }
  
  return 'An error occurred while processing your request';
}