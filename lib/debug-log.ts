/**
 * Debug logging utilities for development and production environments
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export function debugLog(message: string, ...args: any[]) {
  if (isDevelopment) {
    console.log(`[DEBUG] ${message}`, ...args);
  }
}

export function debugError(message: string, error?: any) {
  if (isDevelopment) {
    console.error(`[ERROR] ${message}`, error);
  }
}