import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// GET handler for server-side logout
export async function GET(req: NextRequest) {
  // Get the cookie store
  const cookieStore = cookies();
  
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
  
  // Delete all cookies related to authentication
  cookieNames.forEach(name => {
    // Delete with normal domain
    response.cookies.delete(name);
    
    // Also try with domain flag
    response.cookies.set({
      name,
      value: '',
      expires: new Date(0),
      path: '/',
      domain: '.plugged.in', // Match the domain with leading dot
    });
    
    // And try without leading dot
    response.cookies.set({
      name,
      value: '',
      expires: new Date(0),
      path: '/',
      domain: 'plugged.in',
    });
  });
  
  return response;
}
