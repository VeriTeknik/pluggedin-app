/**
 * Debug logging utilities for development and production environments
 * Uses lazy evaluation for runtime flexibility
 */

/**
 * Check if we're in development mode
 * Evaluated at runtime for better flexibility
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Log debug messages in development mode
 * @param message - The message to log
 * @param args - Additional arguments to log
 */
export function debugLog(message: string, ...args: any[]) {
  if (isDevelopment()) {
    console.log(`[DEBUG] ${message}`, ...args);
  }
}

/**
 * Log error messages in development mode
 * @param message - The error message
 * @param error - The error object or additional details
 */
export function debugError(message: string, error?: any) {
  if (isDevelopment()) {
    console.error(`[ERROR] ${message}`, error);
  }
}

/**
 * Log warning messages in development mode
 * @param message - The warning message
 * @param args - Additional arguments to log
 */
export function debugWarn(message: string, ...args: any[]) {
  if (isDevelopment()) {
    console.warn(`[WARN] ${message}`, ...args);
  }
}