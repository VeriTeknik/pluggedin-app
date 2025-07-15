'use server';

import { and, eq } from 'drizzle-orm';
import { promises as fs } from 'fs';
import path from 'path';
import { z } from 'zod';

import { db } from '@/db';
import { mcpServersTable, profilesTable, projectsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { PackageManagerConfig } from '@/lib/mcp/package-manager/config';

const checkOAuthSchema = z.object({
  serverUuid: z.string().uuid(),
});

/**
 * Check if an mcp-remote server has completed OAuth by checking for tokens in its OAuth directory
 */
export async function checkMcpRemoteOAuthCompletion(serverUuid: string): Promise<{
  success: boolean;
  isAuthenticated: boolean;
  error?: string;
}> {
  try {
    // Validate input
    const validated = checkOAuthSchema.parse({ serverUuid });
    
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, isAuthenticated: false, error: 'Not authenticated' };
    }

    // Get server details
    const serverQuery = await db
      .select({
        server: mcpServersTable,
        profile: profilesTable,
        project: projectsTable,
      })
      .from(mcpServersTable)
      .leftJoin(
        profilesTable,
        eq(mcpServersTable.profile_uuid, profilesTable.uuid)
      )
      .leftJoin(
        projectsTable,
        eq(profilesTable.project_uuid, projectsTable.uuid)
      )
      .where(
        and(
          eq(mcpServersTable.uuid, validated.serverUuid),
          eq(projectsTable.user_id, session.user.id)
        )
      )
      .limit(1);

    if (!serverQuery || serverQuery.length === 0) {
      return { success: false, isAuthenticated: false, error: 'Server not found' };
    }

    const { server, profile } = serverQuery[0];

    // Check if this is an mcp-remote server
    if (!server.args || !Array.isArray(server.args) || !server.args.includes('mcp-remote')) {
      return { success: false, isAuthenticated: false, error: 'Not an mcp-remote server' };
    }

    // Check OAuth directory for tokens
    const oauthDir = path.join(PackageManagerConfig.PACKAGE_STORE_DIR, 'servers', validated.serverUuid, 'oauth', '.mcp-auth');
    
    // Also check without .mcp-auth subdirectory (some versions store directly in oauth/)
    const oauthDirAlt = path.join(PackageManagerConfig.PACKAGE_STORE_DIR, 'servers', validated.serverUuid, 'oauth');
    
    let hasTokens = false;
    
    // Check primary location - mcp-remote stores tokens in subdirectories
    try {
      await fs.access(oauthDir);
      const entries = await fs.readdir(oauthDir);
      
      // Check subdirectories for token files
      for (const entry of entries) {
        const entryPath = path.join(oauthDir, entry);
        const stat = await fs.stat(entryPath);
        
        if (stat.isDirectory()) {
          // Check inside subdirectory for token files
          const subFiles = await fs.readdir(entryPath);
          const tokenFile = subFiles.find(f => f.includes('_tokens.json'));
          if (tokenFile) {
            hasTokens = true;
            break;
          }
        }
      }
    } catch (error) {
    }
    
    // Check alternate location if not found
    if (!hasTokens) {
      try {
        await fs.access(oauthDirAlt);
        const files = await fs.readdir(oauthDirAlt);
        
        // Check for .mcp-auth directory
        if (files.includes('.mcp-auth')) {
          const mcpAuthPath = path.join(oauthDirAlt, '.mcp-auth');
          const stat = await fs.stat(mcpAuthPath);
          
          if (stat.isDirectory()) {
            // Check subdirectories in .mcp-auth
            const mcpAuthEntries = await fs.readdir(mcpAuthPath);
            for (const entry of mcpAuthEntries) {
              const entryPath = path.join(mcpAuthPath, entry);
              const entryStat = await fs.stat(entryPath);
              
              if (entryStat.isDirectory()) {
                const subFiles = await fs.readdir(entryPath);
                const tokenFile = subFiles.find(f => f.includes('_tokens.json'));
                if (tokenFile) {
                  hasTokens = true;
                  break;
                }
              }
            }
          }
        }
        
      } catch (error) {
      }
    }
    
    try {
      
      if (hasTokens) {
        // OAuth is completed, update the server config
        const currentConfig = (server.config as any) || {};
        // Determine provider from server args or name
        let provider = 'mcp-remote';
        const urlIndex = server.args?.findIndex((arg: string) => arg.includes('http'));
        if (urlIndex !== -1 && urlIndex !== undefined && server.args) {
          const url = server.args[urlIndex];
          if (url.includes('linear')) provider = 'Linear';
          else if (url.includes('github')) provider = 'GitHub';
          else if (url.includes('slack')) provider = 'Slack';
        } else if (server.name?.toLowerCase().includes('linear')) {
          provider = 'Linear';
        }
        
        const updatedConfig = {
          ...currentConfig,
          requires_auth: false,
          oauth_completed_at: new Date().toISOString(),
          oauth_provider: provider,
        };
        
        // Remove oauth_initiated_at since it's now completed
        delete updatedConfig.oauth_initiated_at;
        
        await db
          .update(mcpServersTable)
          .set({ config: updatedConfig })
          .where(eq(mcpServersTable.uuid, validated.serverUuid));
        
        return { success: true, isAuthenticated: true };
      }
      
      return { success: true, isAuthenticated: false };
    } catch (error) {
      // Directory doesn't exist or error reading it
      return { success: true, isAuthenticated: false };
    }
  } catch (error) {
    console.error('Error checking mcp-remote OAuth:', error);
    return { 
      success: false, 
      isAuthenticated: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}