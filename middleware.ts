import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export default async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const isAuthenticated = !!token;

  // Get the pathname of the request
  const pathname = req.nextUrl.pathname;

  // Define routes that require authentication
  const protectedRoutes = ['/search', '/mcp-servers', '/mcp-playground'];
  
  // Define routes that are only accessible to unauthenticated users
  const authRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

  // Check if the route requires authentication
  const requiresAuth = protectedRoutes.some((route) => pathname.startsWith(route));
  
  // Check if the route is only for unauthenticated users
  const isAuthRoute = authRoutes.some((route) => pathname === route);

  // Redirect authenticated users away from auth routes
  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL('/mcp-servers', req.url));
  }

  // Redirect unauthenticated users to login
  if (requiresAuth && !isAuthenticated) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
} 