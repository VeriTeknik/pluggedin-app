'use server';

import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { mcpServersTable, profilesTable, projectsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { decryptServerData, encryptField } from '@/lib/encryption';
import { oauthStateManager } from '@/lib/mcp/oauth/OAuthStateManager';

export interface OAuthStatus {
  isAuthenticated: boolean;
  provider?: string;
  lastAuthenticated?: Date;
  hasActiveSession: boolean;
}

/**
 * Get OAuth status for a specific MCP server
 */
export async function getMcpServerOAuthStatus(serverUuid: string): Promise<{
  success: boolean;
  data?: OAuthStatus;
  error?: string;
}> {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get server details directly from database with joins to verify ownership
    const serverQuery = await db
      .select({
        server: mcpServersTable,
        profile: profilesTable,
        project: projectsTable
      })
      .from(mcpServersTable)
      .leftJoin(profilesTable, eq(mcpServersTable.profile_uuid, profilesTable.uuid))
      .leftJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
      .where(
        and(
          eq(mcpServersTable.uuid, serverUuid),
          eq(projectsTable.user_id, session.user.id)
        )
      )
      .limit(1);

    if (!serverQuery || serverQuery.length === 0) {
      return { success: false, error: 'Server not found or access denied' };
    }

    const { server, profile } = serverQuery[0];

    // Check for active OAuth sessions
    const activeSessions = await oauthStateManager.getActiveSessionsForServer(serverUuid);
    const hasActiveSession = activeSessions.length > 0;

    // Check if server has OAuth configuration
    let isAuthenticated = false;
    let provider: string | undefined;
    let lastAuthenticated: Date | undefined;

    // First check config for OAuth completion
    const config = server.config as Record<string, any>;
    if (config?.oauth_completed_at) {
      isAuthenticated = true;
      lastAuthenticated = new Date(config.oauth_completed_at);
      provider = config.oauth_provider;
    }
    
    // For mcp-remote servers, also check the OAuth directory if not already authenticated
    if (!isAuthenticated && server.args && Array.isArray(server.args) && server.args.includes('mcp-remote')) {
      const { checkMcpRemoteOAuthCompletion } = await import('./check-mcp-remote-oauth');
      const mcpRemoteCheck = await checkMcpRemoteOAuthCompletion(serverUuid);
      if (mcpRemoteCheck.success && mcpRemoteCheck.isAuthenticated) {
        isAuthenticated = true;
        provider = 'mcp-remote';
        // The check function updates the database, so re-fetch the config
        const updatedServer = await db
          .select()
          .from(mcpServersTable)
          .where(eq(mcpServersTable.uuid, serverUuid))
          .limit(1);
        if (updatedServer[0]?.config) {
          const updatedConfig = updatedServer[0].config as Record<string, any>;
          if (updatedConfig.oauth_completed_at) {
            lastAuthenticated = new Date(updatedConfig.oauth_completed_at);
            provider = updatedConfig.oauth_provider || provider;
          }
        }
      }
    }

    // Also check environment for OAuth tokens
    if (server.env) {
      const env = server.env as Record<string, any>;
      
      // Check for OAuth tokens in environment
      if (env.OAUTH_ACCESS_TOKEN || env.ACCESS_TOKEN || 
          env.LINEAR_API_KEY || env.LINEAR_OAUTH_TOKEN) {
        isAuthenticated = true;
        if (!provider) {
          // Try to determine provider from server name or URL
          if (server.name?.toLowerCase().includes('linear')) {
            provider = 'Linear';
          } else if (server.url) {
            provider = determineProviderFromUrl(server.url);
          }
        }
        if (!lastAuthenticated) {
          lastAuthenticated = server.created_at;
        }
      }
      
      // Check for OAuth configuration in streamable options
      if (env.__streamableHTTPOptions) {
        try {
          const options = JSON.parse(env.__streamableHTTPOptions);
          if (options.oauth?.accessToken) {
            isAuthenticated = true;
            if (!provider) {
              provider = determineProviderFromConfig(options.oauth);
            }
            if (!lastAuthenticated) {
              lastAuthenticated = server.created_at;
            }
          }
        } catch (e) {
          console.error('Failed to parse streamable options:', e);
        }
      }
    }

    return {
      success: true,
      data: {
        isAuthenticated,
        provider,
        lastAuthenticated,
        hasActiveSession,
      },
    };
  } catch (error) {
    console.error('Error getting OAuth status:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Clear OAuth authentication for a server
 */
export async function clearMcpServerOAuth(serverUuid: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get server details directly from database with joins to verify ownership
    const serverQuery = await db
      .select({
        server: mcpServersTable,
        profile: profilesTable,
        project: projectsTable
      })
      .from(mcpServersTable)
      .leftJoin(profilesTable, eq(mcpServersTable.profile_uuid, profilesTable.uuid))
      .leftJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
      .where(
        and(
          eq(mcpServersTable.uuid, serverUuid),
          eq(projectsTable.user_id, session.user.id)
        )
      )
      .limit(1);

    if (!serverQuery || serverQuery.length === 0) {
      return { success: false, error: 'Server not found or access denied' };
    }

    const { server, profile } = serverQuery[0];

    if (!profile?.uuid) {
      return { success: false, error: 'Server profile not found' };
    }

    // Decrypt server data to get current environment
    const decryptedData = await decryptServerData(server, profile.uuid);
    
    // Clear OAuth tokens from environment
    const env = { ...(decryptedData.env || {}) };
    
    // Remove common OAuth token keys
    delete env.LINEAR_API_KEY;
    delete env.LINEAR_OAUTH_TOKEN;
    delete env.OAUTH_ACCESS_TOKEN;
    delete env.ACCESS_TOKEN;
    
    // Clear OAuth from streamable options
    if (env.__streamableHTTPOptions) {
      try {
        const options = JSON.parse(env.__streamableHTTPOptions);
        if (options.oauth) {
          delete options.oauth.accessToken;
          delete options.oauth.refreshToken;
          env.__streamableHTTPOptions = JSON.stringify(options);
        }
      } catch (e) {
        console.error('Failed to parse streamable options:', e);
      }
    }

    // Also clear OAuth status from config
    const config = { ...(server.config as Record<string, any> || {}) };
    delete config.oauth_completed_at;
    delete config.oauth_provider;
    config.requires_auth = true; // Re-enable auth requirement

    // Encrypt the updated environment
    const encryptedEnv = await encryptField(env, profile.uuid);

    // Update the server
    await db
      .update(mcpServersTable)
      .set({ 
        env_encrypted: encryptedEnv,
        env: null, // Clear old unencrypted env
        config,
      })
      .where(eq(mcpServersTable.uuid, serverUuid));

    // Also clear any active OAuth sessions
    const activeSessions = await oauthStateManager.getActiveSessionsForServer(serverUuid);
    for (const session of activeSessions) {
      await oauthStateManager.deleteOAuthSession(session.state);
    }

    return { success: true };
  } catch (error) {
    console.error('Error clearing OAuth:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Trigger OAuth authentication for a server
 */
export async function triggerMcpServerOAuth(serverUuid: string): Promise<{
  success: boolean;
  authUrl?: string;
  error?: string;
}> {
  // Re-export from the dedicated OAuth trigger module
  const { triggerMcpOAuth } = await import('./trigger-mcp-oauth');
  const result = await triggerMcpOAuth(serverUuid);
  
  return {
    success: result.success,
    authUrl: result.oauthUrl,
    error: result.error
  };
}

function determineProviderFromConfig(oauthConfig: any): string {
  if (oauthConfig.authorizationUrl) {
    try {
      const parsedUrl = new URL(oauthConfig.authorizationUrl);
      const hostname = parsedUrl.hostname.toLowerCase();
      
      // Whitelist of known OAuth providers
      const providerMap: Record<string, string> = {
        'linear.app': 'Linear',
        'github.com': 'GitHub',
        'accounts.google.com': 'Google',
        'google.com': 'Google',
        'slack.com': 'Slack',
        'api.notion.com': 'Notion',
        'notion.so': 'Notion'
      };
      
      // Check exact hostname match first
      if (providerMap[hostname]) {
        return providerMap[hostname];
      }
      
      // Check if hostname ends with known domains (for subdomains)
      for (const [domain, provider] of Object.entries(providerMap)) {
        if (hostname === domain || hostname.endsWith(`.${domain}`)) {
          return provider;
        }
      }
    } catch (e) {
      // Invalid URL, return generic provider
      console.error('Invalid authorization URL:', e);
    }
  }
  return 'OAuth Provider';
}

function determineProviderFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // Whitelist of known OAuth providers
    const providerMap: Record<string, string> = {
      'linear.app': 'Linear',
      'github.com': 'GitHub',
      'accounts.google.com': 'Google',
      'google.com': 'Google',
      'slack.com': 'Slack',
      'api.notion.com': 'Notion',
      'notion.so': 'Notion',
      'atlassian.com': 'Jira',
      'atlassian.net': 'Jira'
    };
    
    // Check exact hostname match first
    if (providerMap[hostname]) {
      return providerMap[hostname];
    }
    
    // Check if hostname ends with known domains (for subdomains)
    for (const [domain, provider] of Object.entries(providerMap)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return provider;
      }
    }
    
    // Special case for Jira/Confluence which may have custom domains
    if (hostname.includes('jira') || parsedUrl.pathname.includes('jira')) {
      return 'Jira';
    }
    if (hostname.includes('confluence') || parsedUrl.pathname.includes('confluence')) {
      return 'Confluence';
    }
  } catch (e) {
    // Invalid URL, return generic provider
    console.error('Invalid URL for provider detection:', e);
  }
  return 'OAuth Provider';
}