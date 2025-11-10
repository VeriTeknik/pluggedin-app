/**
 * OAuth Error Sanitization
 * Prevents information disclosure by sanitizing error messages in production
 */

/**
 * Sanitize error messages to prevent information disclosure
 * In production, returns generic messages; in development, returns detailed errors
 *
 * @param error - Error object or string
 * @param context - Context of the error (e.g., 'oauth', 'token_exchange')
 * @returns Sanitized error message safe for client display
 */
export function sanitizeOAuthError(
  error: unknown,
  context: 'oauth' | 'token_exchange' | 'discovery' | 'registration' = 'oauth'
): string {
  // In development, return detailed error messages for debugging
  if (process.env.NODE_ENV === 'development') {
    if (typeof error === 'string') {
      return error;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'Unknown error';
  }

  // Production: Return generic, safe error messages

  if (typeof error === 'string') {
    // Sanitize string errors
    if (error.includes('network') || error.includes('fetch') || error.includes('ECONNREFUSED')) {
      return 'Network error during authentication';
    }
    if (error.includes('timeout') || error.includes('ETIMEDOUT')) {
      return 'Authentication request timed out';
    }
    if (error.includes('invalid') || error.includes('unauthorized')) {
      return 'Invalid authentication credentials';
    }
    if (error.includes('not found') || error.includes('404')) {
      return 'Authentication service not found';
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network-related errors
    if (message.includes('network') || message.includes('fetch') || message.includes('econnrefused')) {
      return 'Network error during authentication';
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('etimedout') || message.includes('aborted')) {
      return 'Authentication request timed out';
    }

    // Authorization/Authentication errors
    if (message.includes('invalid') || message.includes('unauthorized') || message.includes('401')) {
      return 'Invalid authentication credentials';
    }

    // Not found errors
    if (message.includes('not found') || message.includes('404')) {
      return 'Authentication service not found';
    }

    // Rate limit errors
    if (message.includes('rate limit') || message.includes('too many requests') || message.includes('429')) {
      return 'Too many authentication attempts. Please try again later';
    }

    // Server errors
    if (message.includes('500') || message.includes('502') || message.includes('503')) {
      return 'Authentication service temporarily unavailable';
    }
  }

  // Context-specific generic messages
  switch (context) {
    case 'token_exchange':
      return 'Failed to exchange authorization code for access token';
    case 'discovery':
      return 'Failed to discover OAuth configuration';
    case 'registration':
      return 'Failed to register OAuth client';
    case 'oauth':
    default:
      return 'Authentication failed. Please try again';
  }
}

/**
 * Sanitize OAuth callback error for user display
 * Returns user-friendly error message and optional details
 */
export function sanitizeCallbackError(error: unknown): {
  message: string;
  details?: string;
} {
  if (process.env.NODE_ENV === 'development') {
    return {
      message: 'OAuth callback failed',
      details: error instanceof Error ? error.message : String(error),
    };
  }

  // Production: generic message only
  return {
    message: sanitizeOAuthError(error, 'oauth'),
  };
}
