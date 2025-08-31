/**
 * CORS configuration for OAuth endpoints
 * Restricts access to trusted origins only
 */

export function getCorsHeaders(origin?: string | null): HeadersInit {
  // Get allowed origins from environment variable or use defaults
  const allowedOrigins = process.env.OAUTH_ALLOWED_ORIGINS
    ? process.env.OAUTH_ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [
        'http://localhost:12005',
        'http://localhost:3000',
        'https://plugged.in',
        'https://www.plugged.in',
        'https://registry.plugged.in'
      ];

  // Check if the origin is allowed
  const isAllowed = origin && allowedOrigins.includes(origin);
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

export function getSecurityHeaders(): HeadersInit {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
  };
}