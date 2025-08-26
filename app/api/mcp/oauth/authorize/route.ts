import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { oauthStateManager } from '@/lib/mcp/oauth/OAuthStateManager';
import { db } from '@/db';
import { projectsTable, profilesTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * OAuth authorization endpoint for MCP
 * This initiates the OAuth flow for connecting external services
 */
export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const provider = searchParams.get('provider');
    const serverUuid = searchParams.get('server_uuid') || '00000000-0000-0000-0000-000000000000'; // Use valid UUID format
    const redirectUri = searchParams.get('redirect_uri');
    
    if (!provider) {
      return NextResponse.json(
        { error: 'Provider is required' },
        { status: 400 }
      );
    }
    
    // For native Plugged.in OAuth, redirect to our OAuth authorize endpoint
    if (provider === 'pluggedin') {
      // Build the OAuth authorization URL with all necessary params
      const authUrl = new URL(`${process.env.NEXTAUTH_URL}/api/oauth/authorize`);
      
      // Pass through all relevant params
      const clientId = searchParams.get('client_id') || 'mcp-connector';
      const scope = searchParams.get('scope') || 'mcp:read mcp:execute';
      const responseType = 'code';
      const state = searchParams.get('state') || crypto.randomUUID();
      const isPopup = searchParams.get('popup') === 'true';
      
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri || `${process.env.NEXTAUTH_URL}/api/mcp/oauth/callback`);
      authUrl.searchParams.set('response_type', responseType);
      authUrl.searchParams.set('scope', scope);
      authUrl.searchParams.set('state', state);
      if (isPopup) authUrl.searchParams.set('popup', 'true');
      
      return NextResponse.redirect(authUrl);
    }

    // Get user's active profile
    const result = await db
      .select({
        profileUuid: profilesTable.uuid
      })
      .from(projectsTable)
      .leftJoin(profilesTable, eq(projectsTable.active_profile_uuid, profilesTable.uuid))
      .where(eq(projectsTable.user_id, session.user.id))
      .limit(1);

    if (result.length === 0 || !result[0].profileUuid) {
      return NextResponse.json(
        { error: 'No active profile found' },
        { status: 400 }
      );
    }

    const profileUuid = result[0].profileUuid;

    // Create OAuth session with state
    const callbackUrl = `${process.env.NEXTAUTH_URL}/api/mcp/oauth/callback`;
    const state = await oauthStateManager.createOAuthSession(
      serverUuid,
      profileUuid,
      callbackUrl,
      provider
    );

    // Build OAuth authorization URL based on provider
    let authUrl: string;
    const baseRedirectUri = `${process.env.NEXTAUTH_URL}/api/mcp/oauth/callback`;

    switch (provider.toLowerCase()) {
      case 'pluggedin':
        // Native Plugged.in OAuth for MCP authentication
        authUrl = new URL(`${process.env.NEXTAUTH_URL}/api/oauth/authorize`).toString();
        const pluggedinParams = new URLSearchParams({
          client_id: searchParams.get('client_id') || 'mcp-connector',
          redirect_uri: baseRedirectUri,
          response_type: 'code',
          scope: searchParams.get('scope') || 'mcp:read mcp:execute',
          state: state
        });
        authUrl = `${authUrl}?${pluggedinParams.toString()}`;
        break;

      case 'github':
        authUrl = new URL('https://github.com/login/oauth/authorize').toString();
        const githubParams = new URLSearchParams({
          client_id: process.env.GITHUB_CLIENT_ID || '',
          redirect_uri: baseRedirectUri,
          scope: 'repo user',
          state: state
        });
        authUrl = `${authUrl}?${githubParams.toString()}`;
        break;

      case 'google':
        authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth').toString();
        const googleParams = new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID || '',
          redirect_uri: baseRedirectUri,
          scope: 'openid email profile',
          response_type: 'code',
          state: state,
          access_type: 'offline',
          prompt: 'consent'
        });
        authUrl = `${authUrl}?${googleParams.toString()}`;
        break;

      case 'linear':
        authUrl = new URL('https://linear.app/oauth/authorize').toString();
        const linearParams = new URLSearchParams({
          client_id: process.env.LINEAR_CLIENT_ID || '',
          redirect_uri: baseRedirectUri,
          response_type: 'code',
          scope: 'read write',
          state: state
        });
        authUrl = `${authUrl}?${linearParams.toString()}`;
        break;

      default:
        return NextResponse.json(
          { error: `Unsupported provider: ${provider}` },
          { status: 400 }
        );
    }

    // If this is a popup request, return HTML that redirects
    const isPopup = searchParams.get('popup') === 'true';
    if (isPopup) {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authorizing ${provider}...</title>
          <script>
            window.location.href = '${authUrl}';
          </script>
        </head>
        <body>
          <p>Redirecting to ${provider} for authorization...</p>
        </body>
        </html>
      `;
      
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html'
        }
      });
    }

    // Otherwise, return JSON with the auth URL
    return NextResponse.json({
      authUrl,
      state,
      provider
    });

  } catch (error) {
    console.error('OAuth authorization error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate OAuth flow' },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint to exchange OAuth code for tokens
 */
export async function POST(request: NextRequest) {
  try {
    // Check if user is authenticated
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { code, state, provider } = body;

    if (!code || !state || !provider) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Verify OAuth state
    const oauthSession = await oauthStateManager.getOAuthSession(state);
    if (!oauthSession) {
      return NextResponse.json(
        { error: 'Invalid or expired OAuth state' },
        { status: 400 }
      );
    }

    // Exchange code for tokens based on provider
    let tokenResponse: any;
    
    switch (provider.toLowerCase()) {
      case 'github':
        const githubTokenUrl = 'https://github.com/login/oauth/access_token';
        const githubResponse = await fetch(githubTokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code: code
          })
        });
        tokenResponse = await githubResponse.json();
        break;

      case 'google':
        const googleTokenUrl = 'https://oauth2.googleapis.com/token';
        const googleResponse = await fetch(googleTokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID || '',
            client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: `${process.env.NEXTAUTH_URL}/api/mcp/oauth/callback`
          })
        });
        tokenResponse = await googleResponse.json();
        break;

      default:
        return NextResponse.json(
          { error: `Unsupported provider: ${provider}` },
          { status: 400 }
        );
    }

    // Clean up OAuth session
    await oauthStateManager.deleteOAuthSession(state);

    // Return the access token
    return NextResponse.json({
      access_token: tokenResponse.access_token,
      token_type: tokenResponse.token_type || 'Bearer',
      scope: tokenResponse.scope,
      provider: provider
    });

  } catch (error) {
    console.error('OAuth token exchange error:', error);
    return NextResponse.json(
      { error: 'Failed to exchange OAuth code for token' },
      { status: 500 }
    );
  }
}