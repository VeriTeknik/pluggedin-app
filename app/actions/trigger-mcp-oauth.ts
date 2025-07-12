'use server';

import { z } from 'zod';
import { db } from '@/db';
import { mcpServersTable, profilesTable, projectsTable } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getAuthSession } from '@/lib/auth';
import { encryptField, decryptServerData, encryptServerData } from '@/lib/encryption';
import { OAuthProcessManager } from '@/lib/mcp/oauth-process-manager';

const triggerOAuthSchema = z.object({
  serverUuid: z.string().uuid(),
});

export async function triggerMcpOAuth(serverUuid: string) {
  try {
    console.log('[triggerMcpOAuth] Starting OAuth for server:', serverUuid);
    
    // Validate input
    const validated = triggerOAuthSchema.parse({ serverUuid });
    
    // Check authentication
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated' };
    }
    
    // Get server details directly from database
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
          eq(mcpServersTable.uuid, validated.serverUuid),
          eq(projectsTable.user_id, session.user.id)
        )
      )
      .limit(1);
    
    if (!serverQuery || serverQuery.length === 0) {
      return { success: false, error: 'Server not found or access denied' };
    }
    
    const { server: serverRow, profile } = serverQuery[0];
    
    if (!profile?.uuid) {
      return { success: false, error: 'Server profile not found' };
    }
    
    // Decrypt server data with profile UUID
    const decryptedData = await decryptServerData(serverRow, profile.uuid);
    const server = {
      ...serverRow,
      ...decryptedData
    };
    
    console.log('[triggerMcpOAuth] Server details:', {
      name: server.name,
      type: server.type,
      command: server.command,
      args: server.args,
      hasEnv: !!server.env,
      url: server.url
    });
    
    // Determine OAuth approach based on server type and configuration
    let oauthResult;
    
    if (server.args && Array.isArray(server.args) && server.args.some(arg => arg === 'mcp-remote')) {
      // Handle mcp-remote servers (like Linear)
      console.log('[triggerMcpOAuth] Detected mcp-remote server, using handleMcpRemoteOAuth');
      oauthResult = await handleMcpRemoteOAuth(server);
    } else if (server.type === 'STREAMABLE_HTTP' || server.type === 'SSE') {
      // Handle direct OAuth servers
      console.log('[triggerMcpOAuth] Using handleDirectOAuth for streamable server');
      oauthResult = await handleDirectOAuth(server);
    } else {
      return { 
        success: false, 
        error: 'OAuth not supported for this server type' 
      };
    }
    
    if (oauthResult.oauthUrl) {
      // OAuth URL found, return it for the client to open
      return {
        success: true,
        oauthUrl: oauthResult.oauthUrl,
        message: 'Please complete authentication in your browser'
      };
    }
    
    if (oauthResult.success && oauthResult.token) {
      // Store the token in the server's environment
      await storeOAuthToken(validated.serverUuid, oauthResult, profile.uuid);
      
      return {
        success: true,
        message: 'OAuth authentication completed successfully'
      };
    }
    
    return {
      success: false,
      error: oauthResult.error || 'OAuth authentication failed'
    };
    
  } catch (error) {
    console.error('Error triggering OAuth:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Handle OAuth for mcp-remote servers
 */
async function handleMcpRemoteOAuth(server: any) {
  // Extract the remote URL from args
  const urlIndex = server.args?.findIndex((arg: string) => arg.includes('http'));
  const remoteUrl = urlIndex !== -1 ? server.args[urlIndex] : null;
  
  if (!remoteUrl) {
    return { success: false, error: 'No remote URL found in server configuration' };
  }
  
  // Determine callback port (Linear uses 14881)
  let callbackPort = 3334; // Default mcp-remote port
  if (remoteUrl.includes('linear')) {
    callbackPort = 14881;
  }
  
  // Create OAuth process manager instance
  const oauthProcessManager = new OAuthProcessManager();
  
  // Spawn mcp-remote to handle OAuth
  return await oauthProcessManager.triggerOAuth({
    serverName: server.name,
    serverUrl: remoteUrl,
    command: 'npx',
    args: [
      '-y',
      'mcp-remote',
      remoteUrl,
      '--port', callbackPort.toString()
    ],
    env: server.env || {},
    callbackPort
  });
}

/**
 * Handle OAuth for direct OAuth-enabled servers
 */
async function handleDirectOAuth(server: any) {
  // For servers that handle OAuth directly
  // They should accept an --oauth or similar flag
  const args = [...(server.args || [])];
  
  // Add OAuth flag if not present
  if (!args.includes('--oauth') && !args.includes('--auth')) {
    args.push('--oauth');
  }
  
  // Create OAuth process manager instance
  const oauthProcessManager = new OAuthProcessManager();
  
  return await oauthProcessManager.triggerOAuth({
    serverName: server.name,
    serverUrl: server.url,
    command: server.command || 'node',
    args,
    env: server.env || {}
  });
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
    
    // Prepare updated environment with OAuth token
    const currentEnv = server.env || {};
    const updatedEnv = {
      ...currentEnv,
      // Store token in multiple formats for compatibility
      OAUTH_ACCESS_TOKEN: oauthResult.token,
      ACCESS_TOKEN: oauthResult.token,
    };
    
    // For Linear specifically (but generically detected)
    if (server.name?.toLowerCase().includes('linear')) {
      updatedEnv.LINEAR_OAUTH_TOKEN = oauthResult.token;
      updatedEnv.LINEAR_API_KEY = oauthResult.token;
    }
    
    // For streamable HTTP servers, also store in options with proper headers
    if (server.type === 'STREAMABLE_HTTP' || server.type === 'SSE') {
      const currentOptions = server.env?.__streamableHTTPOptions ? 
        JSON.parse(server.env.__streamableHTTPOptions) : {};
      
      updatedEnv.__streamableHTTPOptions = JSON.stringify({
        ...currentOptions,
        headers: {
          ...currentOptions.headers,
          'Authorization': `Bearer ${oauthResult.token}`
        },
        oauth: {
          accessToken: oauthResult.token,
          refreshToken: oauthResult.metadata?.refreshToken,
          expiresAt: oauthResult.metadata?.expiresAt,
        }
      });
    }
    
    // Update config to mark as authenticated
    const currentConfig = (server.config as any) || {};
    const updatedConfig = {
      ...currentConfig,
      requires_auth: false,
      oauth_completed_at: new Date().toISOString(),
      oauth_provider: oauthResult.metadata?.provider
    };
    
    // Encrypt environment if needed
    const encryptedEnv = await encryptField(updatedEnv, profileUuid);
    
    // Update server
    await db
      .update(mcpServersTable)
      .set({
        env_encrypted: encryptedEnv,
        config: updatedConfig,
        updated_at: new Date()
      })
      .where(eq(mcpServersTable.uuid, serverUuid));
      
  } catch (error) {
    console.error('Error storing OAuth token:', error);
    throw error;
  }
}