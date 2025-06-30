'use server';

import { registryService } from '@/lib/services/registry.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { githubAppInstallationsTable } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * Search for MCP servers in the registry
 */
export async function searchRegistryServers(params: {
  query?: string;
  category?: string;
  verified?: boolean;
  tags?: string[];
  limit?: number;
  offset?: number;
  sort?: string;
}) {
  try {
    const result = await registryService.search(params);
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to search registry servers:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search registry servers',
    };
  }
}

/**
 * Get featured servers from the registry
 */
export async function getFeaturedServers() {
  try {
    const result = await registryService.getFeatured();
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to get featured servers:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get featured servers',
    };
  }
}

/**
 * Get trending servers from the registry
 */
export async function getTrendingServers() {
  try {
    const result = await registryService.getTrending();
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to get trending servers:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get trending servers',
    };
  }
}

/**
 * Get recent servers from the registry
 */
export async function getRecentServers() {
  try {
    const result = await registryService.getRecent();
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to get recent servers:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get recent servers',
    };
  }
}

/**
 * Get server categories from the registry
 */
export async function getServerCategories() {
  try {
    const result = await registryService.getCategories();
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to get server categories:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get server categories',
    };
  }
}

/**
 * Get registry statistics
 */
export async function getRegistryStats() {
  try {
    const result = await registryService.getStats();
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to get registry stats:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get registry stats',
    };
  }
}

/**
 * Get server details
 */
export async function getServerDetails(serverId: string) {
  try {
    const result = await registryService.getServer(serverId);
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to get server details:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get server details',
    };
  }
}

// Authenticated actions

/**
 * Get unclaimed servers
 */
export async function getUnclaimedServers(params?: {
  source?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    const result = await registryService.getUnclaimedServers(params);
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to get unclaimed servers:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get unclaimed servers',
    };
  }
}

/**
 * Get servers claimed by the current user
 */
export async function getMyClaimedServers(params?: {
  limit?: number;
  offset?: number;
}) {
  try {
    const result = await registryService.getMyServers(params);
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to get claimed servers:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get claimed servers',
    };
  }
}

/**
 * Claim a server
 */
export async function claimServer(serverId: string, data?: {
  proof_url?: string;
  notes?: string;
}) {
  try {
    const result = await registryService.claimServer(serverId, data);
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to claim server:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to claim server',
    };
  }
}

/**
 * Unclaim a server
 */
export async function unclaimServer(serverId: string, reason?: string) {
  try {
    const result = await registryService.unclaimServer(serverId, reason);
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to unclaim server:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to unclaim server',
    };
  }
}

/**
 * Publish a server to the registry
 */
export async function publishServerToRegistry(data: {
  name: string;
  description: string;
  repository: {
    url: string;
    source: string;
    id: string;
  };
  capabilities: any;
  versions: Array<{
    version: string;
    release_date: string;
    is_latest?: boolean;
  }>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  tags?: string[];
  category?: string;
}) {
  try {
    const result = await registryService.publishServer(data);
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to publish server:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to publish server',
    };
  }
}

/**
 * Update a server in the registry
 */
export async function updateRegistryServer(serverId: string, data: Partial<{
  description: string;
  capabilities: any;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  tags?: string[];
  category?: string;
}>) {
  try {
    const result = await registryService.updateServer(serverId, data);
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to update server:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update server',
    };
  }
}

/**
 * Delete a server from the registry
 */
export async function deleteRegistryServer(serverId: string) {
  try {
    const result = await registryService.deleteServer(serverId);
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to delete server:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete server',
    };
  }
}

/**
 * Add a new version to a server
 */
export async function addServerVersion(serverId: string, data: {
  version: string;
  release_date?: string;
  changelog?: string;
}) {
  try {
    const result = await registryService.addServerVersion(serverId, data);
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to add server version:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add server version',
    };
  }
}

/**
 * Verify server ownership
 */
export async function verifyServerOwnership(serverId: string) {
  try {
    const result = await registryService.verifyServer(serverId);
    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to verify server:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify server',
    };
  }
}

/**
 * Import a GitHub repository to the registry
 */
export async function importGitHubRepository(
  repositoryUrl: string
): Promise<{
  success: boolean;
  error?: string;
  server?: any;
  extraction?: {
    confidence: any;
    warnings: string[];
  };
  isNew?: boolean;
}> {
  try {
    // Validate GitHub URL format
    const githubUrlPattern = /^https:\/\/github\.com\/[\w-]+\/[\w.-]+\/?$/;
    if (!githubUrlPattern.test(repositoryUrl)) {
      return {
        success: false,
        error: 'Invalid GitHub repository URL'
      };
    }

    // Get current user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return {
        success: false,
        error: 'Unauthorized'
      };
    }

    // Check if user has GitHub App installation
    let installationId: string | null = null;
    try {
      const installations = await db
        .select({
          installation_id: githubAppInstallationsTable.installation_id,
        })
        .from(githubAppInstallationsTable)
        .where(eq(githubAppInstallationsTable.user_id, session.user.id))
        .orderBy(desc(githubAppInstallationsTable.created_at))
        .limit(1);
      
      if (installations.length > 0) {
        installationId = installations[0].installation_id;
      }
    } catch (error) {
      console.error('Failed to check GitHub installation:', error);
    }

    // Call the registry service to import the repository
    const result = await registryService.importGitHubRepository(repositoryUrl, {
      installationId,
      userId: session.user.id
    });

    if (result.success) {
      return {
        success: true,
        server: result.data.server,
        extraction: result.data.extraction,
        isNew: result.data.isNew
      };
    } else {
      return {
        success: false,
        error: result.error || 'Failed to import repository'
      };
    }
  } catch (error) {
    console.error('Failed to import repository:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import repository'
    };
  }
}