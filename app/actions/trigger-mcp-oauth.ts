'use server';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { mcpServersTable, profilesTable } from '@/db/schema';
import { withServerAuth } from '@/lib/auth-helpers';
import { decryptServerData, encryptField } from '@/lib/encryption';
import { createBubblewrapConfig, createFirejailConfig } from '@/lib/mcp/client-wrapper';
import { OAuthProcessManager } from '@/lib/mcp/oauth-process-manager';
import type { McpServer } from '@/types/mcp-server';

const triggerOAuthSchema = z.object({
  serverUuid: z.string().uuid(),
});

export async function triggerMcpOAuth(serverUuid: string) {
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
    const decryptedData = await decryptServerData(serverRow, profile.uuid);
    const mcpServer: McpServer = {
      ...serverRow,
      ...decryptedData,
      config: decryptedData.config as Record<string, any> | null,
    };

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
      oauthResult = await handleStreamableHttpOAuth(mcpServer);
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
      
      return {
        success: true,
        oauthUrl: oauthResult.oauthUrl,
        message: 'Please complete authentication in your browser',
      };
    }

    if (oauthResult.success && 'token' in oauthResult && oauthResult.token) {
      // Store the token in the server's environment
      await storeOAuthToken(validated.serverUuid, oauthResult, profile.uuid);

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
        
        // Detect provider from URL in server args
        let provider = 'mcp-remote';
        const urlIndex = mcpServer.args?.findIndex((arg: string) => arg.includes('http'));
        if (urlIndex !== -1 && urlIndex !== undefined && mcpServer.args) {
          try {
            const parsedUrl = new URL(mcpServer.args[urlIndex]);
            const hostname = parsedUrl.hostname.toLowerCase();
            
            if (hostname.includes('linear.app') || hostname.endsWith('.linear.app')) {
              provider = 'Linear';
            } else if (hostname.includes('github.com') || hostname.endsWith('.github.com')) {
              provider = 'GitHub';
            } else if (hostname.includes('slack.com') || hostname.endsWith('.slack.com')) {
              provider = 'Slack';
            }
          } catch (e) {
            // Invalid URL, keep default provider
            console.error('Invalid URL for provider detection:', e);
          }
        }
        
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
          
        return {
          success: true,
          message: 'OAuth authentication completed successfully',
        };
      }
    }

    return {
      success: false,
      error: oauthResult.error || 'OAuth authentication failed',
    };
    });
  } catch (error) {
    console.error('Error triggering OAuth:', error);
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

  // Determine callback port (Linear uses 14881)
  let callbackPort = 3334; // Default mcp-remote port
  try {
    const parsedUrl = new URL(remoteUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname.includes('linear.app') || hostname.endsWith('.linear.app')) {
      callbackPort = 14881;
    }
  } catch (e) {
    // Invalid URL, use default port
    console.error('Invalid remote URL:', e);
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
    }, 2000);
  }
  
  return result;
}


/**
 * Handle OAuth for STREAMABLE_HTTP/SSE servers
 */
async function handleStreamableHttpOAuth(server: McpServer) {

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
    const encryptedEnv = await encryptField(updatedEnv, profileUuid);

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
