import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { oauthProvider } from '@/lib/oauth/provider';
import { db } from '@/db';
import { projectsTable, profilesTable } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * OAuth 2.0 Authorization endpoint for Plugged.in
 * This is where users authorize MCP clients to access their account
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clientId = searchParams.get('client_id');
    const redirectUri = searchParams.get('redirect_uri');
    const responseType = searchParams.get('response_type');
    const scope = searchParams.get('scope') || 'mcp:read mcp:execute';
    const state = searchParams.get('state');
    const codeChallenge = searchParams.get('code_challenge');
    const codeChallengeMethod = searchParams.get('code_challenge_method');

    // Validate required parameters
    if (!clientId || !redirectUri || !responseType) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Missing required parameters',
        },
        { status: 400 }
      );
    }

    // Validate response type
    if (responseType !== 'code') {
      return NextResponse.json(
        {
          error: 'unsupported_response_type',
          error_description: 'Only "code" response type is supported',
        },
        { status: 400 }
      );
    }

    // Validate client (auto-creation for mcp-connector is handled in the provider)
    const clientValidation = await oauthProvider.validateClient(clientId);
    if (!clientValidation.valid) {
      return NextResponse.json(
        {
          error: 'invalid_client',
          error_description: clientValidation.error,
        },
        { status: 400 }
      );
    }

    // Check if redirect URI is registered
    if (!clientValidation.client!.redirectUris.includes(redirectUri)) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Redirect URI not registered for this client',
        },
        { status: 400 }
      );
    }

    // Check if user is authenticated
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      // Redirect to login with return URL
      const returnUrl = new URL('/login', process.env.NEXTAUTH_URL);
      returnUrl.searchParams.set('returnTo', request.url);
      return NextResponse.redirect(returnUrl);
    }

    // Get user's active profile
    const result = await db
      .select({
        profileUuid: profilesTable.uuid,
        profileName: profilesTable.name,
        projectName: projectsTable.name,
      })
      .from(projectsTable)
      .leftJoin(profilesTable, eq(projectsTable.active_profile_uuid, profilesTable.uuid))
      .where(eq(projectsTable.user_id, session.user.id))
      .limit(1);

    if (result.length === 0 || !result[0].profileUuid) {
      return NextResponse.json(
        {
          error: 'server_error',
          error_description: 'No active profile found',
        },
        { status: 500 }
      );
    }

    const { profileUuid, profileName, projectName } = result[0];

    // Build the authorization page URL with all necessary params
    const authPageUrl = new URL('/oauth-authorize', process.env.NEXTAUTH_URL);
    authPageUrl.searchParams.set('client_id', clientId);
    authPageUrl.searchParams.set('client_name', clientValidation.client!.name);
    authPageUrl.searchParams.set('redirect_uri', redirectUri);
    authPageUrl.searchParams.set('scope', scope);
    authPageUrl.searchParams.set('profile_uuid', profileUuid);
    authPageUrl.searchParams.set('profile_name', profileName || 'Default Profile');
    authPageUrl.searchParams.set('project_name', projectName || 'Default Project');
    if (state) authPageUrl.searchParams.set('state', state);
    if (codeChallenge) authPageUrl.searchParams.set('code_challenge', codeChallenge);
    if (codeChallengeMethod) authPageUrl.searchParams.set('code_challenge_method', codeChallengeMethod);

    // Redirect to the authorization page
    return NextResponse.redirect(authPageUrl);
  } catch (error) {
    console.error('Authorization endpoint error:', error);
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * Handle authorization approval/denial
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { approved, clientId, redirectUri, scope, state, profileUuid, codeChallenge, codeChallengeMethod } = body;

    // Build redirect URL
    const redirectUrl = new URL(redirectUri);
    
    if (!approved) {
      // User denied authorization
      redirectUrl.searchParams.set('error', 'access_denied');
      redirectUrl.searchParams.set('error_description', 'User denied authorization');
      if (state) redirectUrl.searchParams.set('state', state);
      
      return NextResponse.json({ redirectUrl: redirectUrl.toString() });
    }

    // Create authorization code
    const codeResult = await oauthProvider.createAuthorizationCode({
      clientId,
      profileUuid,
      redirectUri,
      scope,
      codeChallenge,
      codeChallengeMethod,
    });

    if (!codeResult.success) {
      return NextResponse.json(
        {
          error: 'server_error',
          error_description: codeResult.error,
        },
        { status: 500 }
      );
    }

    // Add code to redirect URL
    redirectUrl.searchParams.set('code', codeResult.code!);
    if (state) redirectUrl.searchParams.set('state', state);

    return NextResponse.json({ redirectUrl: redirectUrl.toString() });
  } catch (error) {
    console.error('Authorization approval error:', error);
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }
  });
}