'use client';

/**
 * Client-side utility to handle authentication errors
 * and redirect to login when needed
 */
export function handleAuthError(error: Error): boolean {
  const isAuthError = 
    error.message === 'NEXT_AUTH_REQUIRED' ||
    error.message.toLowerCase().includes('unauthorized') ||
    error.message.toLowerCase().includes('session expired') ||
    error.message.includes('you must be logged in');
    
  if (isAuthError) {
    // Clear any stored authentication state
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pluggedin-current-project');
      // Use window.location for a full page redirect
      window.location.href = '/login';
    }
    return true;
  }
  
  return false;
}

/**
 * Wraps an async function to handle auth errors gracefully
 */
export async function withClientAuth<T>(
  fn: () => Promise<T>
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Error && handleAuthError(error)) {
      // Auth error handled, return null
      return null;
    }
    // Re-throw non-auth errors
    throw error;
  }
}