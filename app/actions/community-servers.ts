'use server';

import { and, eq, or } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { 
  mcpServersTable,
  McpServerSource,
  McpServerStatus,
  McpServerType, 
  profilesTable,
  registryServersTable,
  sharedMcpServersTable
} from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

import { verifyGitHubOwnership } from './registry-servers';

// Validation schema for community server
const createCommunityServerSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  template: z.object({
    name: z.string(),
    type: z.nativeEnum(McpServerType),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    url: z.string().url().optional(),
    transport: z.string().optional(),
    streamableHTTPOptions: z.any().optional(),
  }),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  profileUuid: z.string().uuid(),
});

/**
 * Create a community server (shared publicly) instead of a local server
 * This is used when adding servers from the search page
 */
export async function createCommunityServer(data: z.infer<typeof createCommunityServerSchema>) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'You must be logged in to add community servers' };
    }

    // Validate input
    const validated = createCommunityServerSchema.parse(data);
    
    // Verify the profile belongs to the user
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.uuid, validated.profileUuid),
      with: {
        project: true
      }
    });

    if (!profile || profile.project.user_id !== session.user.id) {
      return { success: false, error: 'Invalid profile' };
    }

    // Check for duplicates across all server types
    const duplicateCheck = await checkForDuplicates(validated.template, validated.profileUuid);
    if (duplicateCheck.isDuplicate) {
      return { 
        success: false, 
        error: `This server already exists: ${duplicateCheck.reason}`,
        duplicateInfo: duplicateCheck
      };
    }

    // First create a local server entry (required by schema)
    const [localServer] = await db.insert(mcpServersTable).values({
      profile_uuid: validated.profileUuid,
      name: validated.template.name,
      type: validated.template.type,
      description: validated.description,
      command: validated.template.command || null,
      args: validated.template.args || null,
      env: validated.template.env || null,
      url: validated.template.url || null,
      status: McpServerStatus.ACTIVE,
      source: McpServerSource.COMMUNITY,
    }).returning();

    // Then create the shared server linked to the local server
    const [sharedServer] = await db.insert(sharedMcpServersTable).values({
      server_uuid: localServer.uuid,
      profile_uuid: validated.profileUuid,
      title: validated.title,
      description: validated.description,
      template: validated.template,
      is_public: true, // Always public for community servers
      requires_credentials: false,
    }).returning();

    return { 
      success: true, 
      server: sharedServer,
      message: 'Server added to community successfully'
    };
  } catch (error) {
    console.error('Error creating community server:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to create community server' 
    };
  }
}

/**
 * Check for duplicate servers across all tables
 */
async function checkForDuplicates(template: any, profileUuid: string): Promise<{
  isDuplicate: boolean;
  reason?: string;
  location?: 'local' | 'community' | 'registry';
  serverId?: string;
}> {
  // Check by command + args for STDIO servers
  if (template.type === McpServerType.STDIO && template.command) {
    // Check in local servers for the current profile only
    const localServer = await db.query.mcpServersTable.findFirst({
      where: and(
        eq(mcpServersTable.profile_uuid, profileUuid),
        eq(mcpServersTable.command, template.command),
        eq(mcpServersTable.args, template.args || [])
      )
    });
    
    if (localServer) {
      return {
        isDuplicate: true,
        reason: 'Already exists in your local servers',
        location: 'local',
        serverId: localServer.uuid
      };
    }

    // Check in community servers
    const communityServers = await db.query.sharedMcpServersTable.findMany({
      where: eq(sharedMcpServersTable.is_public, true)
    });

    for (const server of communityServers) {
      const serverTemplate = server.template as any;
      if (serverTemplate?.command === template.command && 
          JSON.stringify(serverTemplate?.args || []) === JSON.stringify(template.args || [])) {
        return {
          isDuplicate: true,
          reason: 'Already exists in community servers',
          location: 'community',
          serverId: server.uuid
        };
      }
    }
  }

  // Check by URL for SSE/StreamableHTTP servers
  if ((template.type === McpServerType.SSE || template.type === McpServerType.STREAMABLE_HTTP) && template.url) {
    // Check in local servers for the current profile only
    const localServer = await db.query.mcpServersTable.findFirst({
      where: and(
        eq(mcpServersTable.profile_uuid, profileUuid),
        eq(mcpServersTable.url, template.url)
      )
    });
    
    if (localServer) {
      return {
        isDuplicate: true,
        reason: 'Already exists in your local servers',
        location: 'local',
        serverId: localServer.uuid
      };
    }

    // Check in community servers
    const communityServers = await db.query.sharedMcpServersTable.findMany({
      where: eq(sharedMcpServersTable.is_public, true)
    });

    for (const server of communityServers) {
      const serverTemplate = server.template as any;
      if (serverTemplate?.url === template.url) {
        return {
          isDuplicate: true,
          reason: 'Already exists in community servers',
          location: 'community',
          serverId: server.uuid
        };
      }
    }
  }

  // Check if it's a known package in registry
  if (template.command === 'npx' && template.args?.[0]) {
    const packageName = template.args[0].replace('@latest', '').replace(/-y$/, '').trim();
    
    // Check registry servers
    const registryServer = await db.query.registryServersTable.findFirst({
      where: or(
        eq(registryServersTable.name, packageName),
        eq(registryServersTable.name, `io.github.${packageName}`)
      )
    });

    if (registryServer) {
      return {
        isDuplicate: true,
        reason: 'Already exists in the registry',
        location: 'registry',
        serverId: registryServer.uuid
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Get a community server by UUID
 */
export async function getCommunityServer(uuid: string) {
  try {
    const server = await db.query.sharedMcpServersTable.findFirst({
      where: eq(sharedMcpServersTable.uuid, uuid),
      with: {
        profile: {
          with: {
            project: {
              with: {
                user: true
              }
            }
          }
        }
      }
    });

    if (!server) {
      return { success: false, error: 'Server not found' };
    }

    return { success: true, server };
  } catch (error) {
    console.error('Error getting community server:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get community server' 
    };
  }
}

// Validation schema for claiming a community server
const claimCommunityServerSchema = z.object({
  communityServerUuid: z.string().uuid(),
  repositoryUrl: z.string().url().refine(
    (url) => {
      const regex = /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)$/;
      return regex.test(url);
    },
    {
      message: 'Invalid GitHub repository URL format. Expected: https://github.com/owner/repo',
    }
  ),
  registryToken: z.string().min(1),
});

/**
 * Claim a community server by proving GitHub ownership
 */
export async function claimCommunityServer(data: z.infer<typeof claimCommunityServerSchema>) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'You must be logged in to claim servers' };
    }

    // Validate input
    const validated = claimCommunityServerSchema.parse(data);
    
    // Get the community server
    const communityServer = await db.query.sharedMcpServersTable.findFirst({
      where: eq(sharedMcpServersTable.uuid, validated.communityServerUuid),
      with: {
        profile: {
          with: {
            project: {
              with: {
                user: true
              }
            }
          }
        },
        server: true,
      }
    });

    if (!communityServer) {
      return { success: false, error: 'Community server not found' };
    }

    if (communityServer.is_claimed) {
      return { 
        success: false, 
        error: 'This server has already been claimed',
        claimedBy: communityServer.claimed_by_user_id
      };
    }

    // Verify GitHub ownership
    const ownership = await verifyGitHubOwnership(validated.registryToken, validated.repositoryUrl);
    if (!ownership.isOwner) {
      return { 
        success: false, 
        error: ownership.reason || 'You must be the owner of this repository to claim the server',
        needsAuth: ownership.needsAuth
      };
    }

    // Extract GitHub info
    const match = validated.repositoryUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      return { success: false, error: 'Invalid GitHub URL format' };
    }
    const [, owner, repo] = match;

    // Start a transaction to ensure data consistency
    const result = await db.transaction(async (tx) => {
      // Create registry entry
      const [registryServer] = await tx.insert(registryServersTable).values({
        name: `io.github.${owner}/${repo}`,
        github_owner: owner,
        github_repo: repo,
        repository_url: validated.repositoryUrl,
        description: communityServer.description || communityServer.template?.description || '',
        is_claimed: true,
        is_published: false, // Not published to registry yet
        claimed_by_user_id: session.user.id,
        claimed_at: new Date(),
        metadata: {
          ...communityServer.template,
          originalCommunityServerUuid: communityServer.uuid,
        },
      }).returning();

      // Update community server as claimed
      await tx.update(sharedMcpServersTable)
        .set({
          is_claimed: true,
          claimed_by_user_id: session.user.id,
          claimed_at: new Date(),
          registry_server_uuid: registryServer.uuid,
          updated_at: new Date(),
        })
        .where(eq(sharedMcpServersTable.uuid, validated.communityServerUuid));

      // Update the local server source to REGISTRY
      if (communityServer.server_uuid) {
        await tx.update(mcpServersTable)
          .set({
            source: McpServerSource.REGISTRY,
            external_id: registryServer.uuid,
          })
          .where(eq(mcpServersTable.uuid, communityServer.server_uuid));
      }

      return registryServer;
    });

    return { 
      success: true, 
      registryServer: result,
      message: 'Server claimed successfully! You can now publish it to the registry.'
    };
  } catch (error) {
    console.error('Error claiming community server:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to claim community server' 
    };
  }
}

/**
 * Get claimable community servers (unclaimed)
 */
export async function getClaimableCommunityServers() {
  try {
    const servers = await db.query.sharedMcpServersTable.findMany({
      where: and(
        eq(sharedMcpServersTable.is_public, true),
        eq(sharedMcpServersTable.is_claimed, false)
      ),
      with: {
        profile: {
          with: {
            project: {
              with: {
                user: true
              }
            }
          }
        },
        server: true,
      },
      orderBy: (table, { desc }) => desc(table.created_at),
    });

    return { success: true, servers };
  } catch (error) {
    console.error('Error getting claimable servers:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to get claimable servers',
      servers: []
    };
  }
}