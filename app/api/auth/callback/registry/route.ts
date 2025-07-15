import { NextRequest, NextResponse } from 'next/server';

import { storeRegistryOAuthToken } from '@/app/actions/registry-oauth-session';
import { RateLimiters } from '@/lib/rate-limiter';
import { 
  escapeHtml, 
  encodeForJavaScript, 
  isValidRedirectUrl, 
  getAllowedRedirectHosts,
  sanitizeErrorMessage,
  getSecurityHeaders
} from '@/lib/security-utils';

export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await RateLimiters.registryOAuth(request);
  
  if (!rateLimitResult.allowed) {
    return new NextResponse('Too many OAuth attempts. Please try again later.', {
      status: 429,
      headers: {
        'X-RateLimit-Limit': rateLimitResult.limit.toString(),
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': rateLimitResult.reset.toString(),
        'Retry-After': Math.ceil((rateLimitResult.reset - Date.now()) / 1000).toString(),
      },
    });
  }
  
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || request.nextUrl.origin;
  
  // Validate baseUrl to prevent open redirect attacks
  const allowedHosts = getAllowedRedirectHosts();
  if (!isValidRedirectUrl(baseUrl, allowedHosts)) {
    return new NextResponse('Invalid redirect URL', { status: 400 });
  }
  
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  // Check if this is a popup window by looking for a state parameter
  const state = searchParams.get('state');
  let isPopup = false;
  
  try {
    // Try to parse the state as JSON
    if (state) {
      const stateData = JSON.parse(decodeURIComponent(state));
      isPopup = stateData.popup === true;
    }
  } catch (e) {
    // If state is not valid JSON, check for simple string match as fallback
    isPopup = state?.includes('popup');
  }

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error);
    const sanitizedError = sanitizeErrorMessage(error);
    
    // For popups, we need to return HTML to close the window
    // For regular flow, use redirect
    if (isPopup) {
      // Create a secure callback URL that the popup opener can handle
      const callbackUrl = new URL(`${baseUrl}/api/auth/oauth-popup-handler`);
      callbackUrl.searchParams.set('status', 'error');
      callbackUrl.searchParams.set('error', sanitizedError);
      
      return NextResponse.redirect(callbackUrl);
    } else {
      // Direct redirect for non-popup flows
      const redirectUrl = new URL(`${baseUrl}/search`);
      redirectUrl.searchParams.set('auth_error', sanitizedError);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Handle missing code
  if (!code) {
    if (isPopup) {
      const callbackUrl = new URL(`${baseUrl}/api/auth/oauth-popup-handler`);
      callbackUrl.searchParams.set('status', 'error');
      callbackUrl.searchParams.set('error', 'missing_code');
      return NextResponse.redirect(callbackUrl);
    } else {
      const redirectUrl = new URL(`${baseUrl}/search`);
      redirectUrl.searchParams.set('auth_error', 'missing_code');
      return NextResponse.redirect(redirectUrl);
    }
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
      
      if (isPopup) {
        const callbackUrl = new URL(`${baseUrl}/api/auth/oauth-popup-handler`);
        callbackUrl.searchParams.set('status', 'error');
        callbackUrl.searchParams.set('error', 'token_exchange_failed');
        return NextResponse.redirect(callbackUrl);
      } else {
        const redirectUrl = new URL(`${baseUrl}/search`);
        redirectUrl.searchParams.set('auth_error', 'token_exchange_failed');
        return NextResponse.redirect(redirectUrl);
      }
    }

    if (!tokenData.access_token) {
      console.error('No access token received:', tokenData);
      
      if (isPopup) {
        const callbackUrl = new URL(`${baseUrl}/api/auth/oauth-popup-handler`);
        callbackUrl.searchParams.set('status', 'error');
        callbackUrl.searchParams.set('error', 'no_access_token');
        return NextResponse.redirect(callbackUrl);
      } else {
        const redirectUrl = new URL(`${baseUrl}/search`);
        redirectUrl.searchParams.set('auth_error', 'no_access_token');
        return NextResponse.redirect(redirectUrl);
      }
    }

    // Get GitHub username for storage
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    const userData = await userResponse.json();
    const githubUsername = userData.login || 'unknown';

    // Store token securely on server-side
    const storeResult = await storeRegistryOAuthToken(tokenData.access_token, githubUsername);
    
    if (!storeResult.success) {
      if (isPopup) {
        const callbackUrl = new URL(`${baseUrl}/api/auth/oauth-popup-handler`);
        callbackUrl.searchParams.set('status', 'error');
        callbackUrl.searchParams.set('error', 'session_storage_failed');
        return NextResponse.redirect(callbackUrl);
      } else {
        const redirectUrl = new URL(`${baseUrl}/search`);
        redirectUrl.searchParams.set('auth_error', 'session_storage_failed');
        return NextResponse.redirect(redirectUrl);
      }
    }

    // Send success response
    if (isPopup) {
      const callbackUrl = new URL(`${baseUrl}/api/auth/oauth-popup-handler`);
      callbackUrl.searchParams.set('status', 'success');
      callbackUrl.searchParams.set('username', githubUsername);
      return NextResponse.redirect(callbackUrl);
    } else {
      // Direct redirect to search page for non-popup flows
      return NextResponse.redirect(`${baseUrl}/search`);
    }

  } catch (error) {
    console.error('OAuth callback processing error:', error);
    
    if (isPopup) {
      const callbackUrl = new URL(`${baseUrl}/api/auth/oauth-popup-handler`);
      callbackUrl.searchParams.set('status', 'error');
      callbackUrl.searchParams.set('error', 'callback_processing_failed');
      return NextResponse.redirect(callbackUrl);
    } else {
      const redirectUrl = new URL(`${baseUrl}/search`);
      redirectUrl.searchParams.set('auth_error', 'callback_processing_failed');
      return NextResponse.redirect(redirectUrl);
    }
  }
} 