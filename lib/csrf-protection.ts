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
 * Centralized CSRF configuration
 */
const CSRF_CONFIG = {
  // Production domains
  allowedDomains: [
    'plugged.in',
    'www.plugged.in',
    'rc1.plugged.in',
    'api.plugged.in',
  ],
  // Development domains
  developmentDomains: [
    'localhost:12005',
    '127.0.0.1:12005',
    'localhost:3000',
    '127.0.0.1:3000',
  ],
};

/**
 * Get allowed origins as full URLs
 */
function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>();

  // Add NEXTAUTH_URL origin
  if (process.env.NEXTAUTH_URL) {
    try {
      const url = new URL(process.env.NEXTAUTH_URL);
      origins.add(url.origin);
    } catch (e) {
      console.warn('Invalid NEXTAUTH_URL:', process.env.NEXTAUTH_URL);
    }
  }

  // Add production domains
  for (const domain of CSRF_CONFIG.allowedDomains) {
    origins.add(`https://${domain}`);
    origins.add(`http://${domain}`); // Allow HTTP for local testing
  }

  // Add development domains
  if (process.env.NODE_ENV === 'development') {
    for (const domain of CSRF_CONFIG.developmentDomains) {
      origins.add(`http://${domain}`);
      origins.add(`https://${domain}`);
    }
  }

  return origins;
}

/**
 * Validates that a request comes from the same origin
 * Checks Origin header first, falls back to Referer
 */
export function validateOrigin(request: NextRequest): boolean {
  const originHeader = request.headers.get('origin');
  const refererHeader = request.headers.get('referer');

  const allowedOrigins = getAllowedOrigins();

  // Check Origin header (most reliable for POST/PUT/DELETE)
  if (originHeader) {
    return allowedOrigins.has(originHeader);
  }

  // Fall back to Referer header
  if (refererHeader) {
    try {
      const refererUrl = new URL(refererHeader);
      return allowedOrigins.has(refererUrl.origin);
    } catch (e) {
      // Invalid referer URL
      return false;
    }
  }

  // No origin or referer - reject for state-changing operations
  return false;
}

/**
 * Validates CSRF protection for state-changing requests
 * Returns null if valid, or an error response if invalid
 */
export async function validateCSRF(request: NextRequest): Promise<NextResponse | null> {
  const { method } = request;

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

  // Enforce X-Requested-With header for JSON requests
  // Legitimate AJAX requests from our app should include this header
  // Missing header indicates potential CSRF attack
  if (contentType?.includes('application/json') && !customHeader) {
    console.warn('CSRF validation failed: JSON request without X-Requested-With header', {
      url: request.url,
      method,
    });

    return NextResponse.json(
      {
        error: 'Missing required header for JSON requests',
        code: 'CSRF_MISSING_HEADER'
      },
      { status: 403 }
    );
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
 *
 * ⚠️ WARNING: This function relies on easily spoofable User-Agent and Accept headers.
 * It is NOT a security boundary and should NOT be used for authentication or
 * authorization decisions. Use only for heuristic differentiation of request types.
 * Always validate authentication separately using proper credentials (session, API key).
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
