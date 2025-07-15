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

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error);
    const sanitizedError = sanitizeErrorMessage(error);
    const errorData = {
      type: 'github-oauth-error',
      error: sanitizedError
    };
    
    // For popup windows, return a minimal HTML that only posts message and closes
    // This avoids any XSS risks by not rendering any user-controlled content
    const minimalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Callback</title>
          <meta charset="utf-8">
          <script>
            (function() {
              const data = ${encodeForJavaScript(errorData)};
              const origin = ${encodeForJavaScript(baseUrl)};
              const redirectUrl = ${encodeForJavaScript(`${baseUrl}/search?auth_error=${encodeURIComponent(sanitizedError)}`)};
              
              if (window.opener && window.opener !== window) {
                try {
                  window.opener.postMessage(data, origin);
                  setTimeout(function() { window.close(); }, 100);
                } catch (e) {
                  window.location.href = redirectUrl;
                }
              } else {
                window.location.href = redirectUrl;
              }
            })();
          </script>
        </head>
        <body></body>
      </html>
    `;
    return new NextResponse(minimalHtml, {
      headers: { 
        'Content-Type': 'text/html; charset=utf-8',
        ...getSecurityHeaders()
      },
    });
  }

  // Handle missing code
  if (!code) {
    const errorData = {
      type: 'github-oauth-error',
      error: 'Authentication code missing'
    };
    
    // Minimal HTML for OAuth callback
    const minimalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Callback</title>
          <meta charset="utf-8">
          <script>
            (function() {
              const data = ${encodeForJavaScript(errorData)};
              const origin = ${encodeForJavaScript(baseUrl)};
              const redirectUrl = ${encodeForJavaScript(`${baseUrl}/search?auth_error=missing_code`)};
              
              if (window.opener && window.opener !== window) {
                try {
                  window.opener.postMessage(data, origin);
                  setTimeout(function() { window.close(); }, 100);
                } catch (e) {
                  window.location.href = redirectUrl;
                }
              } else {
                window.location.href = redirectUrl;
              }
            })();
          </script>
        </head>
        <body></body>
      </html>
    `;
    return new NextResponse(minimalHtml, {
      headers: { 
        'Content-Type': 'text/html; charset=utf-8',
        ...getSecurityHeaders()
      },
    });
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
      const errorData = {
        type: 'github-oauth-error',
        error: 'Authentication failed'
      };
      
      // Minimal HTML for OAuth callback
      const minimalHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>OAuth Callback</title>
            <meta charset="utf-8">
            <script>
              (function() {
                const data = ${encodeForJavaScript(errorData)};
                const origin = ${encodeForJavaScript(baseUrl)};
                const redirectUrl = ${encodeForJavaScript(`${baseUrl}/search?auth_error=token_exchange_failed`)};
                
                if (window.opener && window.opener !== window) {
                  try {
                    window.opener.postMessage(data, origin);
                    setTimeout(function() { window.close(); }, 100);
                  } catch (e) {
                    window.location.href = redirectUrl;
                  }
                } else {
                  window.location.href = redirectUrl;
                }
              })();
            </script>
          </head>
          <body></body>
        </html>
      `;
      return new NextResponse(minimalHtml, {
        headers: { 
          'Content-Type': 'text/html; charset=utf-8',
          ...getSecurityHeaders()
        },
      });
    }

    if (!tokenData.access_token) {
      console.error('No access token received:', tokenData);
      const errorData = {
        type: 'github-oauth-error',
        error: 'Authentication failed'
      };
      
      // Minimal HTML for OAuth callback
      const minimalHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>OAuth Callback</title>
            <meta charset="utf-8">
            <script>
              (function() {
                const data = ${encodeForJavaScript(errorData)};
                const origin = ${encodeForJavaScript(baseUrl)};
                const redirectUrl = ${encodeForJavaScript(`${baseUrl}/search?auth_error=no_access_token`)};
                
                if (window.opener && window.opener !== window) {
                  try {
                    window.opener.postMessage(data, origin);
                    setTimeout(function() { window.close(); }, 100);
                  } catch (e) {
                    window.location.href = redirectUrl;
                  }
                } else {
                  window.location.href = redirectUrl;
                }
              })();
            </script>
          </head>
          <body></body>
        </html>
      `;
      return new NextResponse(minimalHtml, {
        headers: { 
          'Content-Type': 'text/html; charset=utf-8',
          ...getSecurityHeaders()
        },
      });
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
      const errorData = {
        type: 'github-oauth-error',
        error: 'Failed to store authentication session'
      };
      
      // Minimal HTML for OAuth callback
      const minimalHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>OAuth Callback</title>
            <meta charset="utf-8">
            <script>
              (function() {
                const data = ${encodeForJavaScript(errorData)};
                const origin = ${encodeForJavaScript(baseUrl)};
                const redirectUrl = ${encodeForJavaScript(`${baseUrl}/search?auth_error=session_storage_failed`)};
                
                if (window.opener && window.opener !== window) {
                  try {
                    window.opener.postMessage(data, origin);
                    setTimeout(function() { window.close(); }, 100);
                  } catch (e) {
                    window.location.href = redirectUrl;
                  }
                } else {
                  window.location.href = redirectUrl;
                }
              })();
            </script>
          </head>
          <body></body>
        </html>
      `;
      return new NextResponse(minimalHtml, {
        headers: { 
          'Content-Type': 'text/html; charset=utf-8',
          ...getSecurityHeaders()
        },
      });
    }

    // Send success response without exposing the token
    const successData = {
      type: 'github-oauth-success',
      githubUsername: githubUsername
    };
    
    // Minimal HTML for OAuth callback success
    const minimalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Callback</title>
          <meta charset="utf-8">
          <script>
            (function() {
              const data = ${encodeForJavaScript(successData)};
              const origin = ${encodeForJavaScript(baseUrl)};
              const redirectUrl = '/search';
              
              if (window.opener && window.opener !== window) {
                try {
                  window.opener.postMessage(data, origin);
                  setTimeout(function() { window.close(); }, 100);
                } catch (e) {
                  window.location.href = redirectUrl;
                }
              } else {
                window.location.href = redirectUrl;
              }
            })();
          </script>
        </head>
        <body></body>
      </html>
    `;
    
    return new NextResponse(minimalHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        ...getSecurityHeaders()
      },
    });

  } catch (error) {
    console.error('OAuth callback processing error:', error);
    const errorData = {
      type: 'github-oauth-error',
      error: 'Authentication process failed'
    };
    
    // Minimal HTML for OAuth callback
    const minimalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Callback</title>
          <meta charset="utf-8">
          <script>
            (function() {
              const data = ${encodeForJavaScript(errorData)};
              const origin = ${encodeForJavaScript(baseUrl)};
              const redirectUrl = ${encodeForJavaScript(`${baseUrl}/search?auth_error=callback_processing_failed`)};
              
              if (window.opener && window.opener !== window) {
                try {
                  window.opener.postMessage(data, origin);
                  setTimeout(function() { window.close(); }, 100);
                } catch (e) {
                  window.location.href = redirectUrl;
                }
              } else {
                window.location.href = redirectUrl;
              }
            })();
          </script>
        </head>
        <body></body>
      </html>
    `;
    return new NextResponse(minimalHtml, {
      headers: { 
        'Content-Type': 'text/html; charset=utf-8',
        ...getSecurityHeaders()
      },
    });
  }
} 