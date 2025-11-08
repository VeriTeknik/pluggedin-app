import { NextRequest } from 'next/server';

/**
 * CORS configuration utility for secure cross-origin resource sharing
 */

// Allowed origins - add your production domains here
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
      'http://localhost:12005',
      'https://plugged.in',
      'https://www.plugged.in',
      'https://staging.plugged.in',
    ];

// Development mode allows localhost origins
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Check if an origin is allowed
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  
  // In development, allow localhost origins
  if (isDevelopment && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
    return true;
  }
  
  // Check against allowed origins list
  return ALLOWED_ORIGINS.includes(origin);
}

/**
 * Get CORS headers for a request
 */
export function getCorsHeaders(request: NextRequest): HeadersInit {
  const origin = request.headers.get('origin');
  
  // Only set Access-Control-Allow-Origin if the origin is allowed
  const headers: HeadersInit = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id, WWW-Authenticate',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true',
  };
  
  // Set origin only if it's allowed
  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  
  return headers;
}

/**
 * Create a CORS-enabled response
 */
export function corsResponse(body: any, init?: ResponseInit, request?: NextRequest): Response {
  const response = new Response(body, init);
  
  if (request) {
    const corsHeaders = getCorsHeaders(request);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value as string);
    });
  }
  
  return response;
}

/**
 * Handle CORS preflight requests
 */
export function handleCorsOptions(request: NextRequest): Response {
  return corsResponse(null, { status: 200 }, request);
}