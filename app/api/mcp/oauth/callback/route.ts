import { NextRequest, NextResponse } from 'next/server';
import { oauthStateManager } from '@/lib/mcp/oauth/OAuthStateManager';
import { getAuthSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  
  // Check authentication
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const state = searchParams.get('state');
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Validate state parameter
  if (!state) {
    return createErrorResponse('Missing state parameter');
  }

  try {
    // Look up the OAuth session
    const oauthSession = await oauthStateManager.getOAuthSession(state);
    
    if (!oauthSession) {
      return createErrorResponse('Invalid or expired OAuth session');
    }

    // Handle OAuth errors
    if (error) {
      console.error(`[OAuth Proxy] OAuth error for server ${oauthSession.server_uuid}:`, error, errorDescription);
      
      // Clean up the OAuth session
      await oauthStateManager.deleteOAuthSession(state);
      
      return createErrorResponse(
        `OAuth authorization failed: ${error}`,
        errorDescription || 'The authorization was denied or failed.'
      );
    }

    // Validate authorization code
    if (!code) {
      await oauthStateManager.deleteOAuthSession(state);
      return createErrorResponse('Missing authorization code');
    }

    // Forward the callback to the MCP server's local OAuth server
    try {
      console.log(`[OAuth Proxy] Forwarding callback to ${oauthSession.callback_url}`);
      
      // Build the callback URL with all parameters
      const callbackUrl = new URL(oauthSession.callback_url);
      searchParams.forEach((value, key) => {
        callbackUrl.searchParams.append(key, value);
      });

      // Forward the request to the local OAuth server
      const response = await fetch(callbackUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'Plugged.in OAuth Proxy',
          'X-Forwarded-For': request.headers.get('X-Forwarded-For') || request.ip || 'unknown',
          'X-Forwarded-Host': request.headers.get('Host') || 'plugged.in',
        },
        // Follow redirects
        redirect: 'manual',
      });

      // Check if the local server responded successfully
      if (response.status >= 200 && response.status < 300) {
        // Clean up the OAuth session
        await oauthStateManager.deleteOAuthSession(state);
        
        // Return success page
        return createSuccessResponse(oauthSession.provider);
      } else if (response.status >= 300 && response.status < 400) {
        // Handle redirects from the local server
        const redirectUrl = response.headers.get('Location');
        if (redirectUrl) {
          // Clean up the OAuth session
          await oauthStateManager.deleteOAuthSession(state);
          
          // If it's a local redirect, show success page instead
          if (redirectUrl.startsWith('http://localhost') || redirectUrl.startsWith('http://127.0.0.1')) {
            return createSuccessResponse(oauthSession.provider);
          }
          
          // Otherwise, follow the redirect
          return NextResponse.redirect(redirectUrl);
        }
      }

      // Log error response
      const responseText = await response.text();
      console.error(`[OAuth Proxy] Local server error response:`, {
        status: response.status,
        statusText: response.statusText,
        body: responseText,
      });

      // Clean up the OAuth session
      await oauthStateManager.deleteOAuthSession(state);
      
      return createErrorResponse(
        'Failed to complete OAuth flow',
        `The local MCP server returned an error: ${response.status} ${response.statusText}`
      );
      
    } catch (fetchError) {
      console.error(`[OAuth Proxy] Failed to forward callback:`, fetchError);
      
      // Clean up the OAuth session
      await oauthStateManager.deleteOAuthSession(state);
      
      return createErrorResponse(
        'Failed to connect to MCP server',
        'The local MCP server OAuth callback could not be reached. Make sure the MCP server is running.'
      );
    }
    
  } catch (error) {
    console.error('[OAuth Proxy] Unexpected error:', error);
    return createErrorResponse(
      'Internal server error',
      'An unexpected error occurred while processing the OAuth callback.'
    );
  }
}

function createSuccessResponse(provider: string): NextResponse {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>OAuth Authorization Successful</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 400px;
          }
          h1 {
            color: #10b981;
            margin-bottom: 0.5rem;
          }
          p {
            color: #666;
            margin: 1rem 0;
          }
          .close-message {
            color: #999;
            font-size: 0.875rem;
            margin-top: 2rem;
          }
          .icon {
            font-size: 3rem;
            margin-bottom: 1rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">✅</div>
          <h1>Authorization Successful!</h1>
          <p>You have successfully authorized ${provider} for your MCP server.</p>
          <p>You can now close this window and return to Plugged.in.</p>
          <p class="close-message">This window can be closed at any time.</p>
        </div>
        <script>
          // Try to close the window after a delay
          setTimeout(() => {
            window.close();
          }, 5000);
        </script>
      </body>
    </html>
  `;
  
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}

function createErrorResponse(title: string, description?: string): NextResponse {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>OAuth Authorization Error</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 500px;
          }
          h1 {
            color: #dc2626;
            margin-bottom: 0.5rem;
          }
          p {
            color: #666;
            margin: 1rem 0;
          }
          .error-details {
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 4px;
            padding: 1rem;
            margin: 1rem 0;
            text-align: left;
            font-size: 0.875rem;
            color: #991b1b;
          }
          .close-message {
            color: #999;
            font-size: 0.875rem;
            margin-top: 2rem;
          }
          .icon {
            font-size: 3rem;
            margin-bottom: 1rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">❌</div>
          <h1>${title}</h1>
          ${description ? `
            <div class="error-details">
              ${description}
            </div>
          ` : ''}
          <p>Please close this window and try again.</p>
          <p class="close-message">This window can be closed at any time.</p>
        </div>
      </body>
    </html>
  `;
  
  return new NextResponse(html, {
    status: 400,
    headers: { 'Content-Type': 'text/html' },
  });
}