import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { RateLimiters } from '@/lib/rate-limiter';
import { createErrorResponse } from '@/lib/api-errors';

// Only run middleware on matching paths
export const config = {
  matcher: [
    /*
     * Match all paths except for:
     * 1. /api routes
     * 2. /_next (Next.js internals)
     * 3. /_static (inside /public)
     * 4. all root files inside /public (e.g. /favicon.ico)
     */
    '/((?!api/auth/logout|_next/|_static/|_vercel|[\\w-]+\\.\\w+).*)',
    // Also match MCP API routes for audit logging
    '/api/mcp/:path*',
  ],
};

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const isAuthenticated = !!token;

  // Get the pathname of the request
  const pathname = request.nextUrl.pathname;
  
  // Apply rate limiting to API routes
  if (pathname.startsWith('/api/')) {
    // Skip rate limiting for NextAuth routes (they have their own)
    if (!pathname.startsWith('/api/auth/')) {
      const rateLimiter = pathname.startsWith('/api/mcp/') ? RateLimiters.api : RateLimiters.public;
      const rateLimitResult = await rateLimiter(request);
      
      if (!rateLimitResult.allowed) {
        return createErrorResponse(
          'Too many requests. Please try again later.',
          429,
          'RATE_LIMIT_EXCEEDED'
        );
      }
    }
  }

  // Define routes that require authentication
  const protectedRoutes = [
    '/search', 
    '/mcp-servers', 
    '/mcp-playground',
    '/custom-mcp-servers',
    '/settings',
    '/api-keys',
    '/notifications',
    '/editor',
    '/library'
  ];
  
  // Define routes that are only accessible to unauthenticated users
  const authRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

  // Define routes that can be accessed regardless of authentication status
  const publicRoutes = [
    '/', 
    '/logout',
    '/setup-guide',
    '/inspector-guide',
    '/legal',
    '/legal/contact',
    '/legal/disclaimer',
    '/legal/privacy-policy',
    '/legal/terms-of-service'
  ];

  // Process MCP API requests for audit logging
  if (pathname.startsWith('/api/mcp/')) {
    const startTime = Date.now();
    const method = request.method;
    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const userAgent = request.headers.get('user-agent') || '';
    const forwardedFor = request.headers.get('x-forwarded-for') || '';
    const realIp = request.headers.get('x-real-ip') || '';
    const ip = forwardedFor || realIp || '127.0.0.1';
    
    // Create a response
    const response = NextResponse.next();
    
    // Add custom headers to let the API route know about timing and request info
    response.headers.set('x-request-start-time', startTime.toString());
    response.headers.set('x-request-path', pathname);
    response.headers.set('x-request-method', method);
    response.headers.set('x-user-agent', userAgent);
    
    // Extract the client IP address properly, handling both IPv4 and IPv6
    // For x-forwarded-for, the leftmost value is typically the client IP
    let clientIp = '127.0.0.1'; // Default fallback
    
    if (forwardedFor && typeof forwardedFor === 'string') {
      // Split by comma and trim whitespace, then take the first entry
      const ips = forwardedFor.split(',').map(ip => ip.trim());
      if (ips.length > 0 && ips[0]) {
        clientIp = ips[0]; // Use the leftmost IP (original client)
      }
    } else if (realIp && typeof realIp === 'string') {
      clientIp = realIp.trim();
    }
    
    // IPv6 addresses are valid and don't need special handling in headers
    response.headers.set('x-ip-address', clientIp);
    
    // You could also add this header for your API route to detect
    response.headers.set('x-audit-required', 'true');
    
    return response;
  }

  // Check if the route requires authentication
  const requiresAuth = protectedRoutes.some((route) => pathname.startsWith(route));
  
  // Check if the route is only for unauthenticated users
  const isAuthRoute = authRoutes.some((route) => pathname === route);

  // Check if the route is public (accessible to both authenticated and unauthenticated users)
  const isPublicRoute = publicRoutes.some((route) => 
    route === pathname || (pathname.startsWith(route) && route !== '/')
  );

  // Allow access to public routes
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Redirect authenticated users away from auth routes
  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL('/mcp-servers', request.url));
  }

  // Redirect unauthenticated users to login
  if (requiresAuth && !isAuthenticated) {
    // Store the current URL as the callback URL
    const callbackUrl = encodeURIComponent(request.nextUrl.pathname);
    const response = NextResponse.redirect(new URL(`/login?callbackUrl=${callbackUrl}`, request.url));
    return response;
  }

  return NextResponse.next();
} 