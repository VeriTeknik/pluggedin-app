import { NextResponse } from 'next/server';

/**
 * Standard error response format that doesn't expose internal details
 */
export function createErrorResponse(
  message: string,
  status: number = 500,
  code?: string
) {
  const isDev = process.env.NODE_ENV === 'development';
  
  return NextResponse.json(
    {
      error: message,
      code: code || 'INTERNAL_ERROR',
      // Only include details in development
      ...(isDev && { 
        timestamp: new Date().toISOString() 
      })
    },
    { status }
  );
}

/**
 * Map internal errors to safe external messages
 */
export function getSafeErrorMessage(error: unknown): string {
  // Don't expose internal error messages in production
  if (process.env.NODE_ENV !== 'development') {
    return 'An error occurred while processing your request';
  }
  
  // In development, show more details
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'Unknown error';
}

/**
 * Common error responses
 */
export const ErrorResponses = {
  unauthorized: () => createErrorResponse('Unauthorized', 401, 'UNAUTHORIZED'),
  forbidden: () => createErrorResponse('Forbidden', 403, 'FORBIDDEN'),
  notFound: () => createErrorResponse('Not found', 404, 'NOT_FOUND'),
  badRequest: (message = 'Bad request') => createErrorResponse(message, 400, 'BAD_REQUEST'),
  serverError: () => createErrorResponse('Internal server error', 500, 'INTERNAL_ERROR'),
  validationError: (message = 'Validation failed') => createErrorResponse(message, 422, 'VALIDATION_ERROR'),
} as const;