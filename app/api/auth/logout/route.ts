import { NextRequest, NextResponse } from 'next/server';

// GET handler for server-side logout
export async function GET(req: NextRequest) {
  // Clear all Next.js Auth cookies
  const cookieNames = [
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
    'next-auth.callback-url',
    '__Secure-next-auth.callback-url',
    'next-auth.csrf-token',
    '__Host-next-auth.csrf-token'
  ];
  
  const response = NextResponse.json(
    { success: true },
    { 
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    }
  );
  
  // Get domain from host header or NEXTAUTH_URL
  let hostname = req.headers.get('host') || '';
  if (hostname.includes(':')) {
    hostname = hostname.split(':')[0]; // Remove port if present
  }
  
  // Get the base domain (e.g., plugged.in from rc1.plugged.in)
  const domainParts = hostname.split('.');
  const baseDomain = domainParts.length >= 2 
    ? domainParts.slice(-2).join('.') 
    : hostname;
  
  // Delete all cookies related to authentication
  cookieNames.forEach(name => {
    // Delete with default options (no domain)
    response.cookies.delete(name);
    
    // Try with exact hostname
    response.cookies.set({
      name,
      value: '',
      expires: new Date(0),
      path: '/',
      domain: hostname,
    });
    
    // Try with base domain with leading dot
    response.cookies.set({
      name,
      value: '',
      expires: new Date(0),
      path: '/',
      domain: `.${baseDomain}`,
    });
    
    // Try with full domain with leading dot
    if (domainParts.length > 2) {
      response.cookies.set({
        name,
        value: '',
        expires: new Date(0),
        path: '/',
        domain: `.${hostname}`,
      });
    }
  });
  
  return response;
}
