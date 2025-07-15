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
    
    const errorHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Error</title>
          <script>
            if (window.opener) {
              window.opener.postMessage(${encodeForJavaScript(errorData)}, ${encodeForJavaScript(baseUrl)});
              const errorDiv = document.createElement('div');
              errorDiv.style.cssText = 'font-family: system-ui; padding: 20px; text-align: center; color: #dc2626;';
              errorDiv.innerHTML = '<h2>Authentication failed</h2><p>' + ${encodeForJavaScript(escapeHtml(sanitizedError))} + '</p><p>This window will close automatically...</p>';
              document.body.innerHTML = '';
              document.body.appendChild(errorDiv);
              setTimeout(() => window.close(), 3000);
            } else {
              // Redirect to search page with error message
              const url = new URL(${encodeForJavaScript(baseUrl)} + '/search');
              url.searchParams.set('auth_error', ${encodeForJavaScript(sanitizedError)});
              window.location.href = url.toString();
            }
          </script>
        </head>
        <body>
          <div style="font-family: system-ui; padding: 20px; text-align: center;">
            <h2>Processing...</h2>
          </div>
        </body>
      </html>
    `;
    return new NextResponse(errorHtml, {
      headers: { 
        'Content-Type': 'text/html',
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
    
    const errorHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Error</title>
          <script>
            if (window.opener) {
              window.opener.postMessage(${encodeForJavaScript(errorData)}, ${encodeForJavaScript(baseUrl)});
              setTimeout(() => window.close(), 1000);
            } else {
              const url = new URL(${encodeForJavaScript(baseUrl)} + '/search');
              url.searchParams.set('auth_error', 'missing_code');
              window.location.href = url.toString();
            }
          </script>
        </head>
        <body></body>
      </html>
    `;
    return new NextResponse(errorHtml, {
      headers: { 
        'Content-Type': 'text/html',
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
      
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Error</title>
            <script>
              if (window.opener) {
                window.opener.postMessage(${encodeForJavaScript(errorData)}, ${encodeForJavaScript(baseUrl)});
                setTimeout(() => window.close(), 2000);
              } else {
                const url = new URL(${encodeForJavaScript(baseUrl)} + '/search');
                url.searchParams.set('auth_error', 'token_exchange_failed');
                window.location.href = url.toString();
              }
            </script>
          </head>
          <body></body>
        </html>
      `;
      return new NextResponse(errorHtml, {
        headers: { 
          'Content-Type': 'text/html',
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
      
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Error</title>
            <script>
              if (window.opener) {
                window.opener.postMessage(${encodeForJavaScript(errorData)}, ${encodeForJavaScript(baseUrl)});
                setTimeout(() => window.close(), 2000);
              } else {
                const url = new URL(${encodeForJavaScript(baseUrl)} + '/search');
                url.searchParams.set('auth_error', 'no_access_token');
                window.location.href = url.toString();
              }
            </script>
          </head>
          <body></body>
        </html>
      `;
      return new NextResponse(errorHtml, {
        headers: { 
          'Content-Type': 'text/html',
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
      
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Error</title>
            <script>
              if (window.opener) {
                window.opener.postMessage(${encodeForJavaScript(errorData)}, ${encodeForJavaScript(baseUrl)});
                setTimeout(() => window.close(), 2000);
              } else {
                const url = new URL(${encodeForJavaScript(baseUrl)} + '/search');
                url.searchParams.set('auth_error', 'session_storage_failed');
                window.location.href = url.toString();
              }
            </script>
          </head>
          <body></body>
        </html>
      `;
      return new NextResponse(errorHtml, {
        headers: { 
          'Content-Type': 'text/html',
          ...getSecurityHeaders()
        },
      });
    }

    // Send success response without exposing the token
    const successData = {
      type: 'github-oauth-success',
      githubUsername: githubUsername
    };
    
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Success</title>
          <script>
            // Check if we're in a popup window
            if (window.opener) {
              // Send message to opener with username only
              window.opener.postMessage(${encodeForJavaScript(successData)}, ${encodeForJavaScript(baseUrl)});
              
              // Show success message and close
              const successDiv = document.createElement('div');
              successDiv.style.cssText = 'font-family: system-ui; padding: 20px; text-align: center; color: #10b981;';
              successDiv.innerHTML = '<h2>Authentication successful!</h2><p>This window will close automatically...</p>';
              document.body.innerHTML = '';
              document.body.appendChild(successDiv);
              setTimeout(() => window.close(), 2000);
            } else {
              // Not in a popup, check for saved state from claim flow
              const savedState = localStorage.getItem('claim_server_state');
              if (savedState) {
                try {
                  const state = JSON.parse(savedState);
                  // Don't clean up saved state yet - let the dialog do it
                  // Validate and sanitize the return URL
                  const returnUrl = state.returnUrl || '/search';
                  // Only allow relative URLs starting with /
                  if (returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
                    window.location.href = returnUrl;
                  } else {
                    window.location.href = '/search';
                  }
                } catch (e) {
                  // Fallback to search page
                  window.location.href = '/search';
                }
              } else {
                // No saved state, just go to search page
                window.location.href = '/search';
              }
            }
          </script>
        </head>
        <body>
          <div style="font-family: system-ui; padding: 20px; text-align: center;">
            <h2>Authentication successful!</h2>
            <p>Redirecting...</p>
          </div>
        </body>
      </html>
    `;
    
    return new NextResponse(htmlResponse, {
      headers: {
        'Content-Type': 'text/html',
        ...getSecurityHeaders()
      },
    });

  } catch (error) {
    console.error('OAuth callback processing error:', error);
    const errorData = {
      type: 'github-oauth-error',
      error: 'Authentication process failed'
    };
    
    const errorHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Error</title>
          <script>
            if (window.opener) {
              window.opener.postMessage(${encodeForJavaScript(errorData)}, ${encodeForJavaScript(baseUrl)});
              setTimeout(() => window.close(), 2000);
            } else {
              const url = new URL(${encodeForJavaScript(baseUrl)} + '/search');
              url.searchParams.set('auth_error', 'callback_processing_failed');
              window.location.href = url.toString();
            }
          </script>
        </head>
        <body></body>
      </html>
    `;
    return new NextResponse(errorHtml, {
      headers: { 
        'Content-Type': 'text/html',
        ...getSecurityHeaders()
      },
    });
  }
} 