import { toast } from 'sonner';

export interface ErrorHandlerOptions {
  showToast?: boolean;
  fallbackMessage?: string;
  logError?: boolean;
}

/**
 * Standardized error handler for consistent error processing
 */
export function handleError(
  error: unknown,
  options: ErrorHandlerOptions = {}
): string {
  const {
    showToast = true,
    fallbackMessage = 'An unexpected error occurred',
    logError = false,
  } = options;

  let errorMessage: string;

  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else if (error && typeof error === 'object' && 'message' in error) {
    errorMessage = String(error.message);
  } else {
    errorMessage = fallbackMessage;
  }

  // Log error if requested (useful for development)
  if (logError && process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.error('[Error Handler]', error);
  }

  // Show toast notification if requested
  if (showToast) {
    toast.error(errorMessage);
  }

  return errorMessage;
}

/**
 * Type guard to check if error has a message property
 */
export function hasErrorMessage(error: unknown): error is { message: string } {
  return (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as any).message === 'string'
  );
}

/**
 * Extract error message from various error types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (hasErrorMessage(error)) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

/**
 * Create a standardized error response for server actions
 */
export function createErrorResponse(error: unknown) {
  return {
    success: false as const,
    error: getErrorMessage(error),
  };
}

/**
 * Create a standardized success response for server actions
 */
export function createSuccessResponse<T>(data?: T) {
  return {
    success: true as const,
    ...(data !== undefined && { data }),
  };
}