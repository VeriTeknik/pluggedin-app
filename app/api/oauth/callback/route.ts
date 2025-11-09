import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { mcpServerOAuthTokensTable, mcpServersTable, oauthPkceStatesTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { encryptField } from '@/lib/encryption';
import { mcpOAuthCallbacks } from '@/lib/mcp/metrics';
import { verifyIntegrityHash } from '@/lib/oauth/integrity';
import { getOAuthConfig } from '@/lib/oauth/oauth-config-store';
import { cleanupExpiredPkceStates } from '@/lib/oauth/pkce-cleanup';
import { createRateLimiter } from '@/lib/rate-limiter';

import { and, eq } from 'drizzle-orm';

// P0 Security: Rate limiter for OAuth callback (10 requests per 15 minutes per IP)
const oauthCallbackRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
});

/**
 * P0 Security: Safe redirect helper to prevent open redirect vulnerabilities
 * Only allows redirects to whitelisted paths within the application
 */
function safeRedirect(request: NextRequest, path: string, params?: Record<string, string>): NextResponse {
  // Whitelist of allowed redirect paths
  const allowedPaths = ['/mcp-servers', '/login', '/settings'];

  // Validate path starts with allowed path
  const isAllowed = allowedPaths.some(allowed => path.startsWith(allowed));

  if (!isAllowed) {
    console.error('[OAuth Security] Attempted redirect to disallowed path:', path);
    path = '/mcp-servers'; // Fallback to safe default
  }

  const url = new URL(path, request.url);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  return NextResponse.redirect(url);
}

/**
 * P0 Security: Sanitize error messages to prevent information disclosure
 * Removes sensitive details like stack traces, paths, tokens, etc.
 */
function sanitizeErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return 'Authentication failed';
  }

  if (error instanceof Error) {
    // Remove sensitive patterns from error messages
    const message = error.message
      .replace(/\/[^\s]+/g, '[path]') // Remove file paths
      .replace(/token[_\s]*[:=][^\s&]+/gi, 'token=[redacted]') // Remove token values
      .replace(/secret[_\s]*[:=][^\s&]+/gi, 'secret=[redacted]') // Remove secrets
      .replace(/key[_\s]*[:=][^\s&]+/gi, 'key=[redacted]') // Remove API keys
      .replace(/password[_\s]*[:=][^\s&]+/gi, 'password=[redacted]') // Remove passwords
      .replace(/[a-f0-9]{32,}/gi, '[hash]'); // Remove hashes/tokens

    // Only return generic safe messages
    if (message.includes('network') || message.includes('fetch')) {
      return 'Network error during authentication';
    }
    if (message.includes('timeout')) {
      return 'Authentication request timed out';
    }
    if (message.includes('invalid') || message.includes('unauthorized')) {
      return 'Invalid authentication credentials';
    }

    return 'Authentication failed';
  }

  return 'An unexpected error occurred';
}

/**
 * OAuth Callback Handler
 * Handles the OAuth authorization code callback and exchanges it for tokens
 */
export async function GET(request: NextRequest) {
  try {
    // P0 Security: Apply rate limiting to prevent abuse
    const rateLimitResult = await oauthCallbackRateLimiter(request);
    if (!rateLimitResult.allowed) {
      console.warn('[OAuth Callback] Rate limit exceeded for IP');
      return NextResponse.redirect(
        new URL('/mcp-servers?oauth_error=rate_limit_exceeded', request.url)
      );
    }

    // P0 Security: Clean up expired PKCE states opportunistically (non-blocking)
    cleanupExpiredPkceStates().catch((err) =>
      console.error('[OAuth Callback] PKCE cleanup failed:', err)
    );

    // P0 Security: Verify user is authenticated before processing OAuth callback
    const session = await getAuthSession();
    if (!session?.user?.id) {
      console.error('[OAuth Callback] Unauthenticated request');
      return NextResponse.redirect(
        new URL('/mcp-servers?oauth_error=not_authenticated', request.url)
      );
    }

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
    // P0 Security: Validate state belongs to authenticated user (prevents OAuth flow hijacking)
    const pkceState = await db.query.oauthPkceStatesTable.findFirst({
      where: and(
        eq(oauthPkceStatesTable.state, state),
        eq(oauthPkceStatesTable.user_id, session.user.id) // CRITICAL: Prevent authorization code injection
      ),
    });

    if (!pkceState) {
      console.error('[OAuth Callback] PKCE state not found or does not belong to user:', state);
      mcpOAuthCallbacks.inc({ provider: 'unknown', status: 'invalid_state' });
      return NextResponse.redirect(
        new URL('/mcp-servers?oauth_error=invalid_state', request.url)
      );
    }

    // OAuth 2.1: Verify PKCE state integrity hash to prevent tampering
    if (!verifyIntegrityHash(pkceState)) {
      console.error('[OAuth Callback] PKCE state integrity check failed - possible tampering detected');
      await db.delete(oauthPkceStatesTable).where(eq(oauthPkceStatesTable.state, state));
      mcpOAuthCallbacks.inc({ provider: 'unknown', status: 'invalid_state' });
      return safeRedirect(request, '/mcp-servers', {
        oauth_error: 'integrity_violation',
      });
    }

    // Check if state has expired (OAuth 2.1: 5 minute expiration)
    if (pkceState.expires_at < new Date()) {
      console.error('[OAuth Callback] PKCE state expired');
      await db.delete(oauthPkceStatesTable).where(eq(oauthPkceStatesTable.state, state));
      mcpOAuthCallbacks.inc({ provider: 'unknown', status: 'expired' });
      return NextResponse.redirect(
        new URL('/mcp-servers?oauth_error=state_expired', request.url)
      );
    }

    const serverUuid = pkceState.server_uuid;
    const codeVerifier = pkceState.code_verifier;

    // P0 Security: Validate redirect_uri matches stored value to prevent authorization code interception
    const redirectUri = `${process.env.NEXTAUTH_URL || 'http://localhost:12005'}/api/oauth/callback`;
    if (pkceState.redirect_uri !== redirectUri) {
      console.error('[OAuth Callback] Redirect URI mismatch. Expected:', pkceState.redirect_uri, 'Got:', redirectUri);
      await db.delete(oauthPkceStatesTable).where(eq(oauthPkceStatesTable.state, state));
      return NextResponse.redirect(
        new URL('/mcp-servers?oauth_error=redirect_uri_mismatch', request.url)
      );
    }

    // Get OAuth configuration for the server
    const oauthConfig = await getOAuthConfig(serverUuid);

    if (!oauthConfig) {
      mcpOAuthCallbacks.inc({ provider: 'unknown', status: 'error' });
      return NextResponse.redirect(
        new URL('/mcp-servers?oauth_error=config_not_found', request.url)
      );
    }

    // Extract provider from OAuth config or authorization server
    const provider = oauthConfig.authorization_server
      ? new URL(oauthConfig.authorization_server).hostname.split('.')[0]
      : 'unknown';

    // Exchange authorization code for tokens
    const tokenEndpoint = oauthConfig.token_endpoint;

    // ✅ Use stored client credentials from database
    const clientId = oauthConfig.client_id || process.env.OAUTH_CLIENT_ID || 'pluggedin-dev';

    // P0 Security: Use HTTP Basic Auth per RFC 6749 Section 2.3.1 (prevents credential logging)
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    };

    // Build request body WITHOUT client_secret
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
    });

    // ✅ Add code_verifier if PKCE was used
    if (codeVerifier) {
      tokenParams.set('code_verifier', codeVerifier);
      console.log('[OAuth Callback] Using PKCE code_verifier for token exchange');
    }

    // For confidential clients: Use HTTP Basic Authentication (RFC 6749 Section 2.3.1)
    if (oauthConfig.client_secret_encrypted) {
      const { decryptField } = await import('@/lib/encryption');
      try {
        const clientSecret = decryptField(oauthConfig.client_secret_encrypted);
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
        console.log('[OAuth Callback] Using HTTP Basic Authentication for confidential client');
      } catch (error) {
        console.error('[OAuth Callback] Failed to decrypt client_secret:', error);
        // Continue without client authentication (public client)
      }
    }

    console.log('[OAuth Callback] Exchanging code for tokens at:', tokenEndpoint);
    console.log('[OAuth Callback] Using client_id:', clientId);

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers,
      body: tokenParams,
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[OAuth Callback] Token exchange failed:', errorText);
      mcpOAuthCallbacks.inc({ provider, status: 'error' });
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
      mcpOAuthCallbacks.inc({ provider, status: 'error' });
      return NextResponse.redirect(
        new URL('/mcp-servers?oauth_error=no_access_token', request.url)
      );
    }

    // Store tokens in database
    await storeOAuthTokens(serverUuid, tokenData);

    console.log('[OAuth Callback] Tokens stored successfully for server:', serverUuid);

    // Track successful OAuth callback
    mcpOAuthCallbacks.inc({ provider, status: 'success' });

    // ✅ Clean up PKCE state after successful token exchange
    await db.delete(oauthPkceStatesTable).where(eq(oauthPkceStatesTable.state, state!));

    // Redirect back to MCP servers page with success
    return NextResponse.redirect(
      new URL(`/mcp-servers?oauth_success=true&server=${serverUuid}`, request.url)
    );
  } catch (error) {
    console.error('[OAuth Callback] Unexpected error:', error);

    // Track unexpected error
    mcpOAuthCallbacks.inc({ provider: 'unknown', status: 'error' });

    // Clean up PKCE state on error
    try {
      const state = request.nextUrl.searchParams.get('state');
      if (state) {
        await db.delete(oauthPkceStatesTable).where(eq(oauthPkceStatesTable.state, state));
      }
    } catch (cleanupError) {
      console.error('[OAuth Callback] Failed to clean up PKCE state:', cleanupError);
    }

    // P0 Security: Sanitize error message to prevent information disclosure
    const safeErrorMessage = sanitizeErrorMessage(error);

    return NextResponse.redirect(
      new URL(
        `/mcp-servers?oauth_error=unexpected&details=${encodeURIComponent(safeErrorMessage)}`,
        request.url
      )
    );
  }
}

/**
 * Store OAuth tokens in the database
 * P0 Security: Uses database transaction to ensure atomicity
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
  // P0 Security: Wrap in transaction to prevent partial updates
  await db.transaction(async (tx) => {
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
    const existing = await tx.query.mcpServerOAuthTokensTable.findFirst({
      where: eq(mcpServerOAuthTokensTable.server_uuid, serverUuid),
    });

    if (existing) {
      // Update existing tokens
      await tx
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
      await tx.insert(mcpServerOAuthTokensTable).values({
        server_uuid: serverUuid,
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        token_type: tokenData.token_type || 'Bearer',
        expires_at: expiresAt,
        scopes,
      });
    }

    // Also update server's streamableHTTPOptions with the token
    const server = await tx.query.mcpServersTable.findFirst({
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
      // Normalize token_type to RFC 6750 spec (capitalize first letter)
      const tokenType = tokenData.token_type
        ? tokenData.token_type.charAt(0).toUpperCase() + tokenData.token_type.slice(1).toLowerCase()
        : 'Bearer';

      streamableOptions.headers = {
        ...(streamableOptions.headers || {}),
        Authorization: `${tokenType} ${tokenData.access_token}`,
      };

      console.log('[OAuth Callback] Updating streamableHTTPOptions with Authorization header');
      console.log('[OAuth Callback] Headers:', Object.keys(streamableOptions.headers));

      // Encrypt and store in dedicated column
      const encryptedOptions = encryptField(streamableOptions);

      await tx
        .update(mcpServersTable)
        .set({
          streamable_http_options_encrypted: encryptedOptions,
        })
        .where(eq(mcpServersTable.uuid, serverUuid));
    }
  });
}
