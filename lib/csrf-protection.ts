import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from './auth';

/**
 * CSRF Protection Utility
 *
 * Provides protection against Cross-Site Request Forgery attacks by validating:
 * 1. Origin/Referer headers match the application domain
 * 2. Custom header presence (for AJAX requests)
 * 3. SameSite cookie attributes (already configured in middleware)
 *
 * This is a defense-in-depth approach that complements NextAuth's built-in CSRF protection.
 */

/**
 * Validates that a request comes from the same origin
 * Checks Origin header first, falls back to Referer
 */
export function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');

  // Get allowed origins from environment
  const allowedOrigins = getAllowedOrigins();

  // Check Origin header (most reliable for POST/PUT/DELETE)
  if (origin) {
    return allowedOrigins.some(allowed => origin === allowed || origin === `https://${allowed}` || origin === `http://${allowed}`);
  }

  // Fall back to Referer header
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererHost = refererUrl.host;
      return allowedOrigins.some(allowed => refererHost === allowed || refererHost === host);
    } catch (e) {
      // Invalid referer URL
      return false;
    }
  }

  // No origin or referer - reject for state-changing operations
  return false;
}

/**
 * Get list of allowed origins from environment
 */
function getAllowedOrigins(): string[] {
  const origins: string[] = [];

  // Add NEXTAUTH_URL
  if (process.env.NEXTAUTH_URL) {
    try {
      const url = new URL(process.env.NEXTAUTH_URL);
      origins.push(url.host);
      origins.push(process.env.NEXTAUTH_URL);
    } catch (e) {
      console.warn('Invalid NEXTAUTH_URL:', process.env.NEXTAUTH_URL);
    }
  }

  // Development origins
  if (process.env.NODE_ENV === 'development') {
    origins.push('localhost:12005');
    origins.push('127.0.0.1:12005');
    origins.push('localhost:3000');
    origins.push('127.0.0.1:3000');
  }

  // Production domains
  origins.push('plugged.in');
  origins.push('www.plugged.in');
  origins.push('rc1.plugged.in');
  origins.push('api.plugged.in');

  return origins;
}

/**
 * Validates CSRF protection for state-changing requests
 * Returns null if valid, or an error response if invalid
 */
export async function validateCSRF(request: NextRequest): Promise<NextResponse | null> {
  const method = request.method;

  // Only validate state-changing methods
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return null; // GET, HEAD, OPTIONS are safe
  }

  // Validate origin/referer
  if (!validateOrigin(request)) {
    console.warn('CSRF validation failed: invalid origin', {
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer'),
      method,
      url: request.url,
    });

    return NextResponse.json(
      {
        error: 'Invalid request origin',
        code: 'CSRF_INVALID_ORIGIN'
      },
      { status: 403 }
    );
  }

  // Additional check: require custom header for AJAX requests
  // This prevents simple form-based CSRF attacks
  const customHeader = request.headers.get('x-requested-with');
  const contentType = request.headers.get('content-type');

  // If it's a JSON request without custom header, it might be suspicious
  // (legitimate AJAX requests from our app should include this header)
  if (contentType?.includes('application/json') && !customHeader) {
    // This is a soft check - log but don't block
    // Can be made stricter if needed
    console.info('CSRF notice: JSON request without X-Requested-With header', {
      url: request.url,
      method,
    });
  }

  return null; // Valid
}

/**
 * Middleware wrapper for API routes requiring CSRF protection
 * Usage:
 *
 * export async function POST(request: NextRequest) {
 *   const csrfError = await validateCSRF(request);
 *   if (csrfError) return csrfError;
 *
 *   // ... rest of your handler
 * }
 */

/**
 * Enhanced CSRF validation that also checks for authenticated session
 * Use this for critical operations like password changes, account deletions, etc.
 */
export async function validateCSRFWithAuth(request: NextRequest): Promise<{ error: NextResponse } | { session: any }> {
  // First, validate CSRF
  const csrfError = await validateCSRF(request);
  if (csrfError) {
    return { error: csrfError };
  }

  // Then, validate session
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    };
  }

  return { session };
}

/**
 * Check if request appears to be from a browser
 * Used to differentiate between browser requests (need CSRF) and API clients (use API keys)
 */
export function isBrowserRequest(request: NextRequest): boolean {
  const userAgent = request.headers.get('user-agent') || '';
  const accept = request.headers.get('accept') || '';

  // Check for Authorization header (API key requests)
  if (request.headers.get('authorization')) {
    return false; // API request, not browser
  }

  // Check for common browser user agents
  return userAgent.includes('Mozilla') || accept.includes('text/html');
}
