'use server';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { mcpServersTable, profilesTable, oauthPkceStatesTable } from '@/db/schema';
import { withServerAuth } from '@/lib/auth-helpers';
import { decryptServerData, encryptField } from '@/lib/encryption';
import { createBubblewrapConfig, createFirejailConfig } from '@/lib/mcp/client-wrapper';
import { trackOAuthFlow, mcpOAuthFlows } from '@/lib/mcp/metrics';
import { OAuthProcessManager } from '@/lib/mcp/oauth-process-manager';
import { portAllocator } from '@/lib/mcp/utils/port-allocator';
import { generateIntegrityHash, generateSecureState, generateCodeVerifier } from '@/lib/oauth/integrity';
import type { McpServer } from '@/types/mcp-server';

const triggerOAuthSchema = z.object({
  serverUuid: z.string().uuid(),
});

export async function triggerMcpOAuth(serverUuid: string) {
  const startTime = Date.now();
  let provider = 'unknown';
  let serverType = 'unknown';

  try {
    // Validate input
    const validated = triggerOAuthSchema.parse({ serverUuid });

    return await withServerAuth(validated.serverUuid, async (session, server) => {
      // Get server details with profile information
      const serverQuery = await db
        .select({
          server: mcpServersTable,
          profile: profilesTable,
        })
        .from(mcpServersTable)
        .leftJoin(
          profilesTable,
          eq(mcpServersTable.profile_uuid, profilesTable.uuid)
        )
        .where(eq(mcpServersTable.uuid, validated.serverUuid))
        .limit(1);

      if (!serverQuery || serverQuery.length === 0 || !serverQuery[0].profile) {
        return { success: false, error: 'Server profile not found' };
      }

      const { server: serverRow, profile } = serverQuery[0];

    // Decrypt server data with profile UUID
    const decryptedData = await decryptServerData(serverRow);
    const mcpServer: McpServer = {
      ...serverRow,
      ...decryptedData,
      config: decryptedData.config as Record<string, any> | null,
      transport: decryptedData.transport as 'streamable_http' | 'sse' | 'stdio' | undefined,
    };

    // Extract server type and provider for metrics
    serverType = mcpServer.type || 'unknown';

    // Detect provider from URL for mcp-remote servers
    if (mcpServer.args && Array.isArray(mcpServer.args)) {
      const urlIndex = mcpServer.args.findIndex((arg: string) => arg.includes('http'));
      if (urlIndex !== -1 && mcpServer.args[urlIndex]) {
        try {
          const parsedUrl = new URL(mcpServer.args[urlIndex]);
          const hostname = parsedUrl.hostname.toLowerCase();

          if (hostname === 'linear.app' || hostname.endsWith('.linear.app')) {
            provider = 'Linear';
          } else if (hostname === 'github.com' || hostname.endsWith('.github.com')) {
            provider = 'GitHub';
          } else if (hostname === 'slack.com' || hostname.endsWith('.slack.com')) {
            provider = 'Slack';
          } else if (hostname === 'notion.com' || hostname.endsWith('.notion.com')) {
            provider = 'Notion';
          } else {
            provider = 'mcp-remote';
          }
        } catch (e) {
          provider = 'mcp-remote';
        }
      }
    } else if (mcpServer.type === 'STREAMABLE_HTTP' || mcpServer.type === 'SSE') {
      // For streamable HTTP servers, use hostname as provider
      if (mcpServer.url) {
        try {
          const parsedUrl = new URL(mcpServer.url);
          provider = parsedUrl.hostname.split('.')[0];
        } catch (e) {
          provider = 'streamable_http';
        }
      }
    }

    // Track OAuth flow initiation
    mcpOAuthFlows.inc({ provider, server_type: serverType, status: 'initiated' });

    // Determine OAuth approach based on server type and configuration
    let oauthResult;

    if (
      mcpServer.args &&
      Array.isArray(mcpServer.args) &&
      mcpServer.args.some((arg) => arg === 'mcp-remote')
    ) {
      // Handle mcp-remote servers (like Linear)
      oauthResult = await handleMcpRemoteOAuth(mcpServer);
    } else if (mcpServer.type === 'STREAMABLE_HTTP' || mcpServer.type === 'SSE') {
      // Handle STREAMABLE_HTTP/SSE servers with direct OAuth support
      oauthResult = await handleStreamableHttpOAuth(mcpServer, session.user.id);
    } else {
      return {
        success: false,
        error: 'OAuth not supported for this server type',
      };
    }

    if (oauthResult.oauthUrl) {
      // OAuth URL found, return it for the client to open
      // For mcp-remote servers, we should mark that OAuth has been initiated
      if (mcpServer.args && Array.isArray(mcpServer.args) && mcpServer.args.some((arg) => arg === 'mcp-remote')) {
        // Update config to mark OAuth as initiated (but not completed)
        const currentConfig = (mcpServer.config as any) || {};
        const updatedConfig = {
          ...currentConfig,
          oauth_initiated_at: new Date().toISOString(),
        };

        await db
          .update(mcpServersTable)
          .set({ config: updatedConfig })
          .where(eq(mcpServersTable.uuid, validated.serverUuid));
      }

      // Track OAuth URL generated (partial success - user still needs to complete flow)
      trackOAuthFlow(provider, serverType, Date.now() - startTime, true);

      return {
        success: true,
        oauthUrl: oauthResult.oauthUrl,
        message: 'Please complete authentication in your browser',
      };
    }

    if (oauthResult.success && 'token' in oauthResult && oauthResult.token) {
      // Store the token in the server's environment
      await storeOAuthToken(validated.serverUuid, oauthResult, profile.uuid);

      // Track successful OAuth completion
      trackOAuthFlow(provider, serverType, Date.now() - startTime, true);

      return {
        success: true,
        message: 'OAuth authentication completed successfully',
      };
    }
    
    // For mcp-remote servers, even if we don't get a token back, check if OAuth completed
    if (mcpServer.args && Array.isArray(mcpServer.args) && mcpServer.args.some((arg) => arg === 'mcp-remote')) {
      if (oauthResult.success || ('token' in oauthResult && oauthResult.token === 'oauth_working')) {
        // Update the database to mark OAuth as completed
        const currentConfig = (mcpServer.config as any) || {};

        // Note: provider was already detected earlier in the function
        const updatedConfig = {
          ...currentConfig,
          requires_auth: false,
          oauth_completed_at: new Date().toISOString(),
          oauth_provider: provider,
        };

        await db
          .update(mcpServersTable)
          .set({ config: updatedConfig })
          .where(eq(mcpServersTable.uuid, validated.serverUuid));

        // Track successful OAuth completion
        trackOAuthFlow(provider, serverType, Date.now() - startTime, true);

        return {
          success: true,
          message: 'OAuth authentication completed successfully',
        };
      }
    }

    // Track OAuth failure
    trackOAuthFlow(provider, serverType, Date.now() - startTime, false);

    return {
      success: false,
      error: oauthResult.error || 'OAuth authentication failed',
    };
    });
  } catch (error) {
    console.error('Error triggering OAuth:', error);

    // Track OAuth error
    trackOAuthFlow(provider, serverType, Date.now() - startTime, false);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle OAuth for mcp-remote servers
 */
async function handleMcpRemoteOAuth(server: McpServer) {
  // Extract the remote URL from args
  const urlIndex = server.args?.findIndex((arg: string) =>
    arg.includes('http')
  );
  const remoteUrl = urlIndex !== -1 && urlIndex !== undefined && server.args ? server.args[urlIndex] : null;

  if (!remoteUrl) {
    return {
      success: false,
      error: 'No remote URL found in server configuration',
    };
  }

  // Allocate a dynamic port for OAuth callback
  let callbackPort: number;
  try {
    // Check if we should use legacy port for backward compatibility
    const useLegacyPorts = process.env.OAUTH_USE_LEGACY_PORTS === 'true';
    
    if (useLegacyPorts) {
      // Use legacy hardcoded ports
      callbackPort = 3334; // Default mcp-remote port
      try {
        const parsedUrl = new URL(remoteUrl);
        const hostname = parsedUrl.hostname.toLowerCase();
        if (hostname === 'linear.app' || hostname === 'www.linear.app' || hostname.endsWith('.linear.app')) {
          callbackPort = 14881;
        }
      } catch (e) {
        // Invalid URL, use default port
        console.error('Invalid remote URL:', e);
      }
      console.log(`[triggerMcpOAuth] Using legacy port ${callbackPort} for ${server.name}`);
    } else {
      // Use dynamic port allocation
      callbackPort = await portAllocator.allocatePort();
      console.log(`[triggerMcpOAuth] Allocated dynamic port ${callbackPort} for ${server.name}`);
    }
  } catch (error) {
    console.error(`[triggerMcpOAuth] Failed to allocate port:`, error);
    return {
      success: false,
      error: 'Failed to allocate port for OAuth callback',
    };
  }

  // Create OAuth process manager instance
  const oauthProcessManager = new OAuthProcessManager();

  // Prepare the command and args
  let command = 'npx';
  let args = ['-y', 'mcp-remote', remoteUrl, '--port', callbackPort.toString()];
  let env = server.env || {};

  // Apply sandboxing if available (reuse existing infrastructure)
  // Create a temporary server config for sandboxing
  const oauthServerConfig: McpServer = {
    ...server,
    type: 'STDIO' as any, // Force STDIO type for sandboxing
    command,
    args,
    env,
    applySandboxing: true, // Enable sandboxing for OAuth
  };

  // Try to apply sandboxing using the existing infrastructure
  const bubblewrapConfig = createBubblewrapConfig(oauthServerConfig);
  const firejailConfig = createFirejailConfig(oauthServerConfig);

  // Use sandboxing if available (prefer Bubblewrap, fallback to Firejail)
  if (bubblewrapConfig) {
    command = bubblewrapConfig.command;
    args = bubblewrapConfig.args;
    env = bubblewrapConfig.env;
  } else if (firejailConfig) {
    command = firejailConfig.command;
    args = firejailConfig.args;
    env = firejailConfig.env;
  } else {
  }

  // Spawn mcp-remote to handle OAuth with sandboxing
  const result = await oauthProcessManager.triggerOAuth({
    serverName: server.name,
    serverUuid: server.uuid,
    serverUrl: remoteUrl,
    command,
    args,
    env,
    callbackPort,
  });
  
  // Clean up the OAuth process after completion
  if (result.success || result.oauthUrl) {
    // Give it a moment then clean up
    setTimeout(() => {
      oauthProcessManager.cleanup();
      // Release the allocated port
      if (!process.env.OAUTH_USE_LEGACY_PORTS) {
        portAllocator.releasePort(callbackPort);
      }
    }, 2000);
  } else {
    // Release port immediately on failure
    if (!process.env.OAUTH_USE_LEGACY_PORTS) {
      portAllocator.releasePort(callbackPort);
    }
  }
  
  return result;
}


/**
 * Handle OAuth for STREAMABLE_HTTP/SSE servers
 */
async function handleStreamableHttpOAuth(server: McpServer, userId: string) {

  if (!server.url) {
    return {
      success: false,
      error: 'No URL configured for STREAMABLE_HTTP server',
    };
  }

  try {
    // Try to connect to the server and see if it provides OAuth information
    const response = await fetch(server.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'pluggedin-oauth',
            version: '1.0.0'
          }
        },
        id: 1
      }),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (response.status === 401) {
      // ✅ NEW: Try RFC 9728 OAuth discovery first
      const { discoverOAuthFromResponse } = await import('@/lib/oauth/rfc9728-discovery');
      const { storeDiscoveredOAuthConfig, getOAuthConfig } = await import('@/lib/oauth/oauth-config-store');

      const discovery = await discoverOAuthFromResponse(response, server.url);

      if (discovery.metadata && discovery.authServer) {
        console.log('[OAuth] RFC 9728 discovery successful for server:', server.name);

        // Store discovered OAuth configuration
        await storeDiscoveredOAuthConfig(
          server.uuid,
          discovery.metadata,
          discovery.authServer,
          discovery.resourceId,
          discovery.discoveryMethod!
        );

        // Build OAuth authorization URL
        const authUrl = new URL(discovery.metadata.authorization_endpoint);

        const redirectUri = `${process.env.NEXTAUTH_URL || 'http://localhost:12005'}/api/oauth/callback`;

        // ✅ NEW: Dynamic Client Registration (RFC 7591)
        let clientId: string;
        let clientSecret: string | undefined;

        // Get current OAuth config to check for existing client_id
        const { getOAuthConfig } = await import('@/lib/oauth/oauth-config-store');
        const existingConfig = await getOAuthConfig(server.uuid);

        if (discovery.metadata.registration_endpoint) {
          // Server supports dynamic registration - register or reuse client
          const { getOrRegisterClient } = await import('@/lib/oauth/dynamic-client-registration');

          try {
            const registration = await getOrRegisterClient(
              server.uuid,
              discovery.metadata.registration_endpoint,
              redirectUri,
              existingConfig?.client_id
            );

            clientId = registration.client_id;
            clientSecret = registration.client_secret;

            // Update OAuth config with registered client credentials
            if (registration.client_id !== existingConfig?.client_id) {
              const { storeOAuthConfig } = await import('@/lib/oauth/oauth-config-store');
              await storeOAuthConfig({
                serverUuid: server.uuid,
                authorizationEndpoint: discovery.metadata.authorization_endpoint,
                tokenEndpoint: discovery.metadata.token_endpoint,
                registrationEndpoint: discovery.metadata.registration_endpoint,
                authorizationServer: discovery.authServer,
                resourceIdentifier: discovery.resourceId ?? undefined,
                clientId: registration.client_id,
                clientSecret: registration.client_secret,
                scopes: discovery.metadata.scopes_supported,
                supportsPKCE: discovery.metadata.code_challenge_methods_supported?.includes('S256') ?? true,
                discoveryMethod: discovery.discoveryMethod!,
              });
              console.log('[OAuth] Stored registered client_id:', registration.client_id);
            }
          } catch (regError) {
            console.error('[OAuth] Dynamic registration failed:', regError);
            // Fallback to generic client ID
            clientId = process.env.OAUTH_CLIENT_ID || 'pluggedin-dev';
          }
        } else {
          // No registration endpoint - use configured or generic client ID
          clientId = existingConfig?.client_id || process.env.OAUTH_CLIENT_ID || 'pluggedin-dev';
        }

        const state = crypto.randomUUID();

        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('state', state);

        // Add resource identifier if available (RFC 8707)
        if (discovery.resourceId) {
          authUrl.searchParams.set('resource', discovery.resourceId);
        }

        // Add default scopes if supported
        if (discovery.metadata.scopes_supported?.length) {
          authUrl.searchParams.set('scope', discovery.metadata.scopes_supported.join(' '));
        }

        // Use PKCE if supported (recommended for security)
        if (discovery.metadata.code_challenge_methods_supported?.includes('S256')) {
          // Generate PKCE challenge
          const codeVerifier = crypto.randomUUID() + crypto.randomUUID();
          const encoder = new TextEncoder();
          const data = encoder.encode(codeVerifier);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const codeChallenge = btoa(String.fromCharCode.apply(null, hashArray as any))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');

          authUrl.searchParams.set('code_challenge', codeChallenge);
          authUrl.searchParams.set('code_challenge_method', 'S256');

          // ✅ Store code_verifier for token exchange (linked to state parameter)
          try {
            // OAuth 2.1: Generate HMAC integrity hash to bind state parameters
            const integrityHash = generateIntegrityHash({
              state,
              serverUuid: server.uuid,
              userId,
              codeVerifier,
            });

            await db.insert(oauthPkceStatesTable).values({
              state,
              server_uuid: server.uuid,
              user_id: userId, // P0 Security: Bind PKCE state to user to prevent OAuth hijacking
              code_verifier: codeVerifier,
              redirect_uri: redirectUri,
              integrity_hash: integrityHash, // OAuth 2.1: HMAC binding to prevent tampering
              expires_at: new Date(Date.now() + 5 * 60 * 1000), // OAuth 2.1: Expires in 5 minutes (reduced from 10)
            });
            console.log('[OAuth] PKCE code_verifier stored successfully for state:', state);
          } catch (error) {
            console.error('[OAuth] Failed to store PKCE code_verifier:', error);
            throw error; // Re-throw to fail the OAuth flow if storage fails
          }

          console.log('[OAuth] PKCE enabled for OAuth flow');
        }

        return {
          success: true,
          oauthUrl: authUrl.toString(),
        };
      }

      // Fallback to legacy discovery methods if RFC 9728 fails
      console.log('[OAuth] RFC 9728 discovery failed, trying legacy methods');

      // Check if the server provides OAuth information in headers or response
      const authHeader = response.headers.get('WWW-Authenticate');
      const oauthUrl = response.headers.get('X-OAuth-URL') ||
                       response.headers.get('OAuth-URL') ||
                       response.headers.get('Authorization-URL');

      if (oauthUrl) {
        return {
          success: true,
          oauthUrl: oauthUrl,
        };
      }

      // Try to parse response body for OAuth information
      try {
        const responseText = await response.text();
        let responseData;

        // Handle both JSON and SSE responses
        if (response.headers.get('content-type')?.includes('text/event-stream')) {
          // Parse SSE format
          const dataMatch = responseText.match(/data:\s*({.*})/);
          if (dataMatch) {
            responseData = JSON.parse(dataMatch[1]);
          }
        } else {
          // Parse JSON
          responseData = JSON.parse(responseText);
        }

        // Look for OAuth URL in various possible locations
        const possibleOAuthUrl = responseData?.error?.data?.oauth_url ||
                                responseData?.error?.oauth_url ||
                                responseData?.oauth_url ||
                                responseData?.authorization_url;

        if (possibleOAuthUrl) {
          return {
            success: true,
            oauthUrl: possibleOAuthUrl,
          };
        }

        // If no OAuth URL found, try to construct one based on common patterns
        const serverUrl = new URL(server.url);

        // Try common OAuth endpoints
        const commonOAuthPaths = [
          '/oauth/authorize',
          '/auth/oauth',
          '/login/oauth',
          '/oauth',
          '/auth'
        ];

        for (const path of commonOAuthPaths) {
          const testUrl = new URL(path, serverUrl.origin).toString();

          try {
            const testResponse = await fetch(testUrl, {
              method: 'GET',
              signal: AbortSignal.timeout(5000),
            });

            // If we get a redirect or success, this might be the OAuth endpoint
            if (testResponse.status === 302 || testResponse.status === 200) {
              const location = testResponse.headers.get('Location');
              if (location && (location.includes('oauth') || location.includes('auth'))) {
                return {
                  success: true,
                  oauthUrl: location,
                };
              } else if (testResponse.status === 200) {
                // This might be an OAuth authorization page
                return {
                  success: true,
                  oauthUrl: testUrl,
                };
              }
            }
          } catch (testError) {
            // Continue trying other paths
          }
        }

      } catch (parseError) {
      }

      // If no OAuth URL found anywhere, check if this might be a configuration issue

      // Special check for known servers with specific requirements
      if (server.url?.includes('sentry.dev') && !server.url.endsWith('/mcp')) {
        return {
          success: false,
          error: 'Sentry MCP requires the URL to end with /mcp (e.g., https://mcp.sentry.dev/mcp). Please update your server configuration.',
        };
      }

      return {
        success: false,
        error: 'Authentication required but no OAuth endpoints were discovered. The server may not support OAuth or requires manual configuration.',
      };
    }

    // If server responds with success, it might not need OAuth or has different auth
    if (response.ok) {
      return {
        success: false,
        error: 'Server is accessible without authentication. OAuth may not be required for this server.',
      };
    }

    // Other error responses
    return {
      success: false,
      error: `Server returned HTTP ${response.status}. The server may be configured incorrectly or require different authentication.`,
    };

  } catch (error) {
    console.error('[handleStreamableHttpOAuth] Error testing OAuth:', error);
    return {
      success: false,
      error: `Failed to connect to server: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Store OAuth token in server configuration
 */
async function storeOAuthToken(
  serverUuid: string,
  oauthResult: any,
  profileUuid: string
) {
  try {
    // Get current server
    const [server] = await db
      .select()
      .from(mcpServersTable)
      .where(eq(mcpServersTable.uuid, serverUuid))
      .limit(1);

    if (!server) {
      throw new Error('Server not found');
    }

    // For mcp-remote servers (like Linear), the token might be stored in ~/.mcp-auth
    // In this case, we don't need to store the actual token, just mark OAuth as complete
    const isMcpRemote =
      server.args &&
      Array.isArray(server.args) &&
      server.args.some((arg) => arg === 'mcp-remote');

    // Prepare updated environment
    const currentEnv = server.env || {};
    const updatedEnv: { [key: string]: string } = { ...currentEnv };

    // Only store token if we have a real token (not placeholder)
    if (oauthResult.token && oauthResult.token !== 'oauth_working') {
      // Store token in multiple formats for compatibility
      updatedEnv.OAUTH_ACCESS_TOKEN = oauthResult.token;
      updatedEnv.ACCESS_TOKEN = oauthResult.token;

      // For Linear specifically (but generically detected)
      if (server.name?.toLowerCase().includes('linear')) {
        updatedEnv.LINEAR_OAUTH_TOKEN = oauthResult.token;
        updatedEnv.LINEAR_API_KEY = oauthResult.token;
      }

      // For streamable HTTP servers, also store in options with proper headers
      if (server.type === 'STREAMABLE_HTTP' || server.type === 'SSE') {
        const currentOptions = server.env?.__streamableHTTPOptions
          ? JSON.parse(server.env.__streamableHTTPOptions)
          : {};

        updatedEnv.__streamableHTTPOptions = JSON.stringify({
          ...currentOptions,
          headers: {
            ...currentOptions.headers,
            Authorization: `Bearer ${oauthResult.token}`,
          },
          oauth: {
            accessToken: oauthResult.token,
            refreshToken: oauthResult.metadata?.refreshToken,
            expiresAt: oauthResult.metadata?.expiresAt,
          },
        });
      }
    } else if (isMcpRemote) {
      // For mcp-remote servers, OAuth is handled by the mcp-remote process
      // We just need to mark it as OAuth-enabled without storing tokens
    }

    // Update config to mark as authenticated
    const currentConfig = (server.config as any) || {};
    const updatedConfig = {
      ...currentConfig,
      requires_auth: false,
      oauth_completed_at: new Date().toISOString(),
      oauth_provider: oauthResult.metadata?.provider,
    };

    // Encrypt environment if needed
    const encryptedEnv = encryptField(updatedEnv);

    // Update server
    await db
      .update(mcpServersTable)
      .set({
        env_encrypted: encryptedEnv,
        env: null, // Clear old unencrypted env to avoid conflicts
        config: updatedConfig,
      })
      .where(eq(mcpServersTable.uuid, serverUuid));
  } catch (error) {
    console.error('Error storing OAuth token:', error);
    throw error;
  }
}
