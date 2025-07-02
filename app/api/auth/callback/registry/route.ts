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
    const errorHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Error</title>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'github-oauth-error',
                error: '${error}'
              }, '${baseUrl}');
              document.body.innerHTML = '<div style="font-family: system-ui; padding: 20px; text-align: center; color: #dc2626;"><h2>Authentication failed</h2><p>${error}</p><p>This window will close automatically...</p></div>';
              setTimeout(() => window.close(), 3000);
            } else {
              window.location.href = '${baseUrl}/test-registry-auth?error=${encodeURIComponent(error)}';
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
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Handle missing code
  if (!code) {
    const errorHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Error</title>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'github-oauth-error',
                error: 'missing_code'
              }, '${baseUrl}');
              setTimeout(() => window.close(), 1000);
            } else {
              window.location.href = '${baseUrl}/test-registry-auth?error=missing_code';
            }
          </script>
        </head>
        <body></body>
      </html>
    `;
    return new NextResponse(errorHtml, {
      headers: { 'Content-Type': 'text/html' },
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
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Error</title>
            <script>
              if (window.opener) {
                window.opener.postMessage({
                  type: 'github-oauth-error',
                  error: 'Token exchange failed: ${tokenData.error}'
                }, '${baseUrl}');
                setTimeout(() => window.close(), 2000);
              } else {
                window.location.href = '${baseUrl}/test-registry-auth?error=${encodeURIComponent(tokenData.error)}';
              }
            </script>
          </head>
          <body></body>
        </html>
      `;
      return new NextResponse(errorHtml, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (!tokenData.access_token) {
      console.error('No access token received:', tokenData);
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Error</title>
            <script>
              if (window.opener) {
                window.opener.postMessage({
                  type: 'github-oauth-error',
                  error: 'No access token received'
                }, '${baseUrl}');
                setTimeout(() => window.close(), 2000);
              } else {
                window.location.href = '${baseUrl}/test-registry-auth?error=no_access_token';
              }
            </script>
          </head>
          <body></body>
        </html>
      `;
      return new NextResponse(errorHtml, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Check if this is a popup flow (we can add a state parameter later for more control)
    // For now, we'll detect based on window.opener
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Success</title>
          <script>
            if (window.opener) {
              // Send message to parent window
              window.opener.postMessage({
                type: 'github-oauth-success',
                accessToken: '${tokenData.access_token}'
              }, '${baseUrl}');
              // Show success message before closing
              document.body.innerHTML = '<div style="font-family: system-ui; padding: 20px; text-align: center;"><h2>Authentication successful!</h2><p>This window will close automatically...</p></div>';
              setTimeout(() => window.close(), 1500);
            } else {
              // Fallback: redirect to test page if not in popup
              window.location.href = '${baseUrl}/test-registry-auth?access_token=${tokenData.access_token}';
            }
          </script>
        </head>
        <body>
          <div style="font-family: system-ui; padding: 20px; text-align: center;">
            <h2>Authenticating...</h2>
          </div>
        </body>
      </html>
    `;
    
    return new NextResponse(htmlResponse, {
      headers: {
        'Content-Type': 'text/html',
      },
    });

  } catch (error) {
    console.error('OAuth callback processing error:', error);
    const errorHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Error</title>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'github-oauth-error',
                error: 'Authentication process failed'
              }, '${baseUrl}');
              setTimeout(() => window.close(), 2000);
            } else {
              window.location.href = '${baseUrl}/test-registry-auth?error=callback_processing_failed';
            }
          </script>
        </head>
        <body></body>
      </html>
    `;
    return new NextResponse(errorHtml, {
      headers: { 'Content-Type': 'text/html' },
    });
  }
} 