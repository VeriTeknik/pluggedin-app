import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

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
  ],
};

export default async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const isAuthenticated = !!token;

  // Get the pathname of the request
  const pathname = req.nextUrl.pathname;

  // Define routes that require authentication
  const protectedRoutes = ['/search', '/mcp-servers', '/mcp-playground'];
  
  // Define routes that are only accessible to unauthenticated users
  const authRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

  // Define routes that can be accessed regardless of authentication status
  const publicRoutes = ['/logout'];

  // Check if the route requires authentication
  const requiresAuth = protectedRoutes.some((route) => pathname.startsWith(route));
  
  // Check if the route is only for unauthenticated users
  const isAuthRoute = authRoutes.some((route) => pathname === route);

  // Check if the route is public (accessible to both authenticated and unauthenticated users)
  const isPublicRoute = publicRoutes.some((route) => pathname === route);

  // Allow access to public routes
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Redirect authenticated users away from auth routes
  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL('/mcp-servers', req.url));
  }

  // Redirect unauthenticated users to login
  if (requiresAuth && !isAuthenticated) {
    const response = NextResponse.redirect(new URL('/login', req.url));
    return response;
  }

  return NextResponse.next();
} 