import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { mcpServerOAuthTokensTable, mcpServersTable, oauthPkceStatesTable } from '@/db/schema';
import { encryptField } from '@/lib/encryption';
import { getOAuthConfig } from '@/lib/oauth/oauth-config-store';

import { eq } from 'drizzle-orm';

/**
 * OAuth Callback Handler
 * Handles the OAuth authorization code callback and exchanges it for tokens
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
      console.error('[OAuth Callback] Error from provider:', error, errorDescription);
      return NextResponse.redirect(
        new URL(
          `/mcp-servers?oauth_error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(errorDescription || '')}`,
          request.url
        )
      );
    }

    // Validate required parameters
    if (!code) {
      return NextResponse.redirect(
        new URL('/mcp-servers?oauth_error=missing_code', request.url)
      );
    }

    if (!state) {
      return NextResponse.redirect(
        new URL('/mcp-servers?oauth_error=missing_state', request.url)
      );
    }

    // ✅ Get server UUID and code_verifier from PKCE state storage
    const pkceState = await db.query.oauthPkceStatesTable.findFirst({
      where: eq(oauthPkceStatesTable.state, state),
    });

    if (!pkceState) {
      console.error('[OAuth Callback] PKCE state not found for state:', state);
      return NextResponse.redirect(
        new URL('/mcp-servers?oauth_error=invalid_state', request.url)
      );
    }

    // Check if state has expired
    if (pkceState.expires_at < new Date()) {
      console.error('[OAuth Callback] PKCE state expired');
      await db.delete(oauthPkceStatesTable).where(eq(oauthPkceStatesTable.state, state));
      return NextResponse.redirect(
        new URL('/mcp-servers?oauth_error=state_expired', request.url)
      );
    }

    const serverUuid = pkceState.server_uuid;
    const codeVerifier = pkceState.code_verifier;

    // Get OAuth configuration for the server
    const oauthConfig = await getOAuthConfig(serverUuid);

    if (!oauthConfig) {
      return NextResponse.redirect(
        new URL('/mcp-servers?oauth_error=config_not_found', request.url)
      );
    }

    // Exchange authorization code for tokens
    const tokenEndpoint = oauthConfig.token_endpoint;
    const redirectUri = `${process.env.NEXTAUTH_URL || 'http://localhost:12005'}/api/oauth/callback`;

    // ✅ Use stored client credentials from database
    const clientId = oauthConfig.client_id || process.env.OAUTH_CLIENT_ID || 'pluggedin-dev';

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
    });

    // Add client_secret if available (for confidential clients)
    if (oauthConfig.client_secret_encrypted) {
      const { decryptField } = await import('@/lib/encryption');
      try {
        const clientSecret = decryptField(oauthConfig.client_secret_encrypted);
        tokenParams.set('client_secret', clientSecret);
        console.log('[OAuth Callback] Using client_secret for token exchange');
      } catch (error) {
        console.error('[OAuth Callback] Failed to decrypt client_secret:', error);
      }
    }

    // ✅ Add code_verifier if PKCE was used
    if (codeVerifier) {
      tokenParams.set('code_verifier', codeVerifier);
      console.log('[OAuth Callback] Using PKCE code_verifier for token exchange');
    }

    console.log('[OAuth Callback] Exchanging code for tokens at:', tokenEndpoint);
    console.log('[OAuth Callback] Using client_id:', clientId);

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[OAuth Callback] Token exchange failed:', errorText);
      return NextResponse.redirect(
        new URL(
          `/mcp-servers?oauth_error=token_exchange_failed&details=${encodeURIComponent(errorText)}`,
          request.url
        )
      );
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('[OAuth Callback] No access_token in response:', tokenData);
      return NextResponse.redirect(
        new URL('/mcp-servers?oauth_error=no_access_token', request.url)
      );
    }

    // Store tokens in database
    await storeOAuthTokens(serverUuid, tokenData);

    console.log('[OAuth Callback] Tokens stored successfully for server:', serverUuid);

    // ✅ Clean up PKCE state after successful token exchange
    await db.delete(oauthPkceStatesTable).where(eq(oauthPkceStatesTable.state, state!));

    // Redirect back to MCP servers page with success
    return NextResponse.redirect(
      new URL(`/mcp-servers?oauth_success=true&server=${serverUuid}`, request.url)
    );
  } catch (error) {
    console.error('[OAuth Callback] Unexpected error:', error);

    // Clean up PKCE state on error
    try {
      const state = request.nextUrl.searchParams.get('state');
      if (state) {
        await db.delete(oauthPkceStatesTable).where(eq(oauthPkceStatesTable.state, state));
      }
    } catch (cleanupError) {
      console.error('[OAuth Callback] Failed to clean up PKCE state:', cleanupError);
    }

    return NextResponse.redirect(
      new URL(
        `/mcp-servers?oauth_error=unexpected&details=${encodeURIComponent(error instanceof Error ? error.message : 'Unknown error')}`,
        request.url
      )
    );
  }
}

/**
 * Store OAuth tokens in the database
 */
async function storeOAuthTokens(
  serverUuid: string,
  tokenData: {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
  }
) {
  // Encrypt tokens
  const accessTokenEncrypted = encryptField(tokenData.access_token);
  const refreshTokenEncrypted = tokenData.refresh_token
    ? encryptField(tokenData.refresh_token)
    : null;

  // Calculate expiration time
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000)
    : null;

  // Parse scopes
  const scopes = tokenData.scope ? tokenData.scope.split(' ') : null;

  // Check if tokens already exist for this server
  const existing = await db.query.mcpServerOAuthTokensTable.findFirst({
    where: eq(mcpServerOAuthTokensTable.server_uuid, serverUuid),
  });

  if (existing) {
    // Update existing tokens
    await db
      .update(mcpServerOAuthTokensTable)
      .set({
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        token_type: tokenData.token_type || 'Bearer',
        expires_at: expiresAt,
        scopes,
        updated_at: new Date(),
      })
      .where(eq(mcpServerOAuthTokensTable.server_uuid, serverUuid));
  } else {
    // Insert new tokens
    await db.insert(mcpServerOAuthTokensTable).values({
      server_uuid: serverUuid,
      access_token_encrypted: accessTokenEncrypted,
      refresh_token_encrypted: refreshTokenEncrypted,
      token_type: tokenData.token_type || 'Bearer',
      expires_at: expiresAt,
      scopes,
    });
  }

  // Also update server's streamableHTTPOptions with the token
  const server = await db.query.mcpServersTable.findFirst({
    where: eq(mcpServersTable.uuid, serverUuid),
  });

  if (server && (server.type === 'STREAMABLE_HTTP' || server.type === 'SSE')) {
    // Get current streamableHTTPOptions - decrypt if encrypted
    let streamableOptions: Record<string, any> = {};
    if (server.streamable_http_options_encrypted) {
      const { decryptField } = await import('@/lib/encryption');
      try {
        streamableOptions = decryptField(server.streamable_http_options_encrypted) as Record<string, any>;
      } catch (error) {
        console.error('[OAuth Callback] Failed to decrypt streamable_http_options:', error);
        streamableOptions = {};
      }
    }

    // Update streamableHTTPOptions with Authorization header
    streamableOptions.headers = {
      ...(streamableOptions.headers || {}),
      Authorization: `${tokenData.token_type || 'Bearer'} ${tokenData.access_token}`,
    };

    console.log('[OAuth Callback] Updating streamableHTTPOptions with Authorization header');
    console.log('[OAuth Callback] Headers:', Object.keys(streamableOptions.headers));

    // Encrypt and store in dedicated column
    const encryptedOptions = encryptField(streamableOptions);

    await db
      .update(mcpServersTable)
      .set({
        streamable_http_options_encrypted: encryptedOptions,
      })
      .where(eq(mcpServersTable.uuid, serverUuid));
  }
}
