import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || request.nextUrl.origin;
  
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error);
    return NextResponse.redirect(
      new URL(`/test-registry-auth?error=${encodeURIComponent(error)}`, baseUrl)
    );
  }

  // Handle missing code
  if (!code) {
    return NextResponse.redirect(
      new URL('/test-registry-auth?error=missing_code', baseUrl)
    );
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID || '',
        client_secret: process.env.GITHUB_CLIENT_SECRET || '',
        code: code,
        redirect_uri: `${process.env.NEXTAUTH_URL?.replace(/\/$/, '')}/api/auth/callback/registry`,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('Token exchange error:', tokenData);
      return NextResponse.redirect(
        new URL(`/test-registry-auth?error=${encodeURIComponent(tokenData.error)}`, baseUrl)
      );
    }

    if (!tokenData.access_token) {
      console.error('No access token received:', tokenData);
      return NextResponse.redirect(
        new URL('/test-registry-auth?error=no_access_token', baseUrl)
      );
    }

    // Redirect back to test page with the access token
    // Note: In production, you might want to store this more securely
    const redirectUrl = new URL('/test-registry-auth', baseUrl);
    redirectUrl.searchParams.set('access_token', tokenData.access_token);
    
    return NextResponse.redirect(redirectUrl);

  } catch (error) {
    console.error('OAuth callback processing error:', error);
    return NextResponse.redirect(
      new URL('/test-registry-auth?error=callback_processing_failed', baseUrl)
    );
  }
} 