'use server';

import { and,eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { accounts, registryServersTable, serverClaimRequestsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { PluggedinRegistryClient } from '@/lib/registry/pluggedin-registry-client';

// Validation schemas
const repositoryUrlSchema = z.string().url().refine(
  (url) => {
    const regex = /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)$/;
    return regex.test(url);
  },
  {
    message: 'Invalid GitHub repository URL format. Expected: https://github.com/owner/repo',
  }
);

const addUnclaimedServerSchema = z.object({
  repositoryUrl: repositoryUrlSchema,
  description: z.string().optional(),
  metadata: z.any().optional(),
});

const publishClaimedServerSchema = z.object({
  repositoryUrl: repositoryUrlSchema,
  description: z.string(),
  packageInfo: z.object({
    registry: z.enum(['npm', 'docker', 'pypi']),
    name: z.string(),
    version: z.string(),
  }),
  environmentVariables: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    required: z.boolean().optional(),
  })).optional(),
});

// Helper function to extract GitHub owner and repo from URL
function extractGitHubInfo(url: string): { owner: string; repo: string } {
  const match = url.match(/^https:\/\/github\.com\/([^\/]+)\/([^\/]+)$/);
  if (!match) {
    throw new Error('Invalid GitHub URL');
  }
  return { owner: match[1], repo: match[2] };
}

/**
 * Add an unclaimed server to the local database
 */
export async function addUnclaimedServer(data: z.infer<typeof addUnclaimedServerSchema>) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'You must be logged in to add servers' };
    }

    // Validate input
    const validated = addUnclaimedServerSchema.parse(data);
    const { owner, repo } = extractGitHubInfo(validated.repositoryUrl);
    
    // Check if server already exists
    const existing = await db.query.registryServersTable.findFirst({
      where: and(
        eq(registryServersTable.github_owner, owner),
        eq(registryServersTable.github_repo, repo)
      ),
    });

    if (existing) {
      return { 
        success: false, 
        error: 'This server is already in the registry',
        serverUuid: existing.uuid,
        isClaimed: existing.is_claimed
      };
    }

    // Create server entry
    const [server] = await db.insert(registryServersTable).values({
      name: `io.github.${owner}/${repo}`,
      github_owner: owner,
      github_repo: repo,
      repository_url: validated.repositoryUrl,
      description: validated.description,
      is_claimed: false,
      is_published: false,
      metadata: validated.metadata || {},
    }).returning();

    return { 
      success: true, 
      server,
      message: 'Server added successfully. The owner can claim it later.'
    };
  } catch (error) {
    console.error('Error adding unclaimed server:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to add server' 
    };
  }
}

/**
 * Check if user has GitHub account connected via registry OAuth
 */
export async function checkGitHubConnection(registryToken?: string) {
  // For now, just check if we have a registry token
  // The actual username will come from the registry OAuth flow
  return { 
    isConnected: !!registryToken, 
    githubUsername: null // Will be set during OAuth flow
  };
}

/**
 * Verify GitHub ownership using registry OAuth token
 */
export async function verifyGitHubOwnership(registryToken: string, repoUrl: string) {
  try {
    const { owner } = extractGitHubInfo(repoUrl);
    
    if (!registryToken) {
      return { 
        isOwner: false, 
        reason: 'Please authenticate with GitHub to verify ownership',
        needsAuth: true 
      };
    }

    // Check user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${registryToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userResponse.ok) {
      return { 
        isOwner: false, 
        reason: 'Failed to fetch GitHub user info. Please re-authenticate.',
        needsAuth: true 
      };
    }

    const userInfo = await userResponse.json();
    const githubUsername = userInfo.login;
    
    // First check if it's a personal repository
    if (githubUsername.toLowerCase() === owner.toLowerCase()) {
      return { 
        isOwner: true, 
        githubUsername,
        reason: null 
      };
    }
    
    // Check organizations
    const orgsResponse = await fetch('https://api.github.com/user/orgs', {
      headers: {
        Authorization: `Bearer ${registryToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (orgsResponse.ok) {
      const organizations = await orgsResponse.json();
      const isOrgMember = organizations.some((org: any) => 
        org.login.toLowerCase() === owner.toLowerCase()
      );
      
      if (isOrgMember) {
        return { 
          isOwner: true, 
          githubUsername,
          reason: null 
        };
      }
    }
    
    return { 
      isOwner: false, 
      githubUsername,
      reason: `Repository owner '${owner}' does not match your GitHub account (@${githubUsername}) or any of your organizations` 
    };
  } catch (error) {
    console.error('Error verifying GitHub ownership:', error);
    return { 
      isOwner: false, 
      reason: 'Failed to verify ownership. Please try again.',
      needsAuth: true 
    };
  }
}

/**
 * Fetch a server from the registry by its ID
 */
export async function fetchRegistryServer(registryId: string) {
  try {
    const client = new PluggedinRegistryClient();
    
    // Extract the last part as the server ID
    // Format: io.github.owner/repo -> use full ID as lookup
    const server = await client.getServer(registryId);
    
    if (!server) {
      return { 
        success: false, 
        error: 'Server not found in registry' 
      };
    }

    return { 
      success: true, 
      data: server 
    };
  } catch (error) {
    console.error('Error fetching registry server:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch server from registry' 
    };
  }
}

/**
 * Import a server from registry to local profile
 */
export async function importRegistryServer(registryId: string, profileUuid: string) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'You must be logged in to import servers' };
    }

    // Fetch server from registry
    const registryResult = await fetchRegistryServer(registryId);
    if (!registryResult.success || !registryResult.data) {
      return { success: false, error: registryResult.error || 'Server not found in registry' };
    }

    const server = registryResult.data;
    const primaryPackage = server.packages?.[0];

    if (!primaryPackage) {
      return { success: false, error: 'No package information available for this server' };
    }

    // Transform registry data to local server config
    let command = '';
    let args: string[] = [];
    const env: Record<string, string> = {};

    switch (primaryPackage.registry_name) {
      case 'npm':
        command = primaryPackage.runtime_hint || 'npx';
        args = [primaryPackage.name];
        if (primaryPackage.runtime_arguments) {
          args.push(...primaryPackage.runtime_arguments);
        }
        break;
      case 'docker':
        command = 'docker';
        args = ['run'];
        if (primaryPackage.package_arguments) {
          args.push(...primaryPackage.package_arguments.map((arg: any) => arg.value || arg.default || ''));
        }
        args.push(primaryPackage.name);
        break;
      case 'pypi':
        command = primaryPackage.runtime_hint || 'uvx';
        args = [primaryPackage.name];
        break;
      default:
        // Unknown type, try to infer
        if (primaryPackage.name?.endsWith('.py')) {
          command = 'python';
          args = [primaryPackage.name];
        } else {
          command = 'node';
          args = [primaryPackage.name];
        }
    }

    // Extract environment variables with empty values for user to fill
    if (primaryPackage.environment_variables) {
      primaryPackage.environment_variables.forEach((envVar: any) => {
        env[envVar.name] = '';
      });
    }

    // Import using existing mcp-servers action
    const { createMcpServer } = await import('./mcp-servers');
    
    const result = await createMcpServer({
      name: server.name.split('/').pop() || server.name,
      profileUuid,
      description: server.description || '',
      command,
      args,
      env: Object.keys(env).length > 0 ? env : undefined,
      type: 'STDIO' as any, // Registry servers are typically STDIO
      source: 'REGISTRY' as any,
      external_id: server.id,
    });

    if (result.success) {
      return { 
        success: true, 
        server: result.server,
        message: 'Server imported successfully from registry' 
      };
    } else {
      return { 
        success: false, 
        error: result.error || 'Failed to import server' 
      };
    }
  } catch (error) {
    console.error('Error importing registry server:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to import server from registry' 
    };
  }
}

/**
 * Publish a claimed server to the official registry
 */
export async function publishClaimedServer(data: z.infer<typeof publishClaimedServerSchema>) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'You must be logged in to publish servers' };
    }

    // Validate input
    const validated = publishClaimedServerSchema.parse(data);
    const { owner, repo } = extractGitHubInfo(validated.repositoryUrl);
    
    // Verify ownership
    const ownership = await verifyGitHubOwnership(session.user.id, validated.repositoryUrl);
    if (!ownership.isOwner) {
      return { 
        success: false, 
        error: ownership.reason || 'You must be the owner of this repository to publish it' 
      };
    }

    // Check if already exists
    const existing = await db.query.registryServersTable.findFirst({
      where: and(
        eq(registryServersTable.github_owner, owner),
        eq(registryServersTable.github_repo, repo)
      ),
    });

    if (existing?.is_published) {
      return { 
        success: false, 
        error: 'This server is already published to the registry' 
      };
    }

    // Prepare registry payload
    const registryPayload = {
      name: `io.github.${owner}/${repo}`,
      description: validated.description,
      packages: [{
        registry_name: validated.packageInfo.registry,
        name: validated.packageInfo.name,
        version: validated.packageInfo.version,
        environment_variables: validated.environmentVariables,
      }],
      repository: {
        url: validated.repositoryUrl,
        source: 'github',
        id: `${owner}/${repo}`,
      },
      version_detail: {
        version: validated.packageInfo.version,
      },
    };

    // Publish to registry
    const client = new PluggedinRegistryClient();
    const authToken = process.env.REGISTRY_AUTH_TOKEN;
    
    if (!authToken) {
      return { success: false, error: 'Registry authentication not configured' };
    }

    const registryResult = await client.publishServer(registryPayload, authToken);
    
    // Save or update in our database
    if (existing) {
      // Update existing entry
      const [updated] = await db.update(registryServersTable)
        .set({
          registry_id: registryResult.id,
          description: validated.description,
          is_claimed: true,
          is_published: true,
          claimed_by_user_id: session.user.id,
          claimed_at: new Date(),
          published_at: new Date(),
          metadata: registryPayload,
          updated_at: new Date(),
        })
        .where(eq(registryServersTable.uuid, existing.uuid))
        .returning();
      
      return { success: true, server: updated };
    } else {
      // Create new entry
      const [server] = await db.insert(registryServersTable).values({
        registry_id: registryResult.id,
        name: `io.github.${owner}/${repo}`,
        github_owner: owner,
        github_repo: repo,
        repository_url: validated.repositoryUrl,
        description: validated.description,
        is_claimed: true,
        is_published: true,
        claimed_by_user_id: session.user.id,
        claimed_at: new Date(),
        published_at: new Date(),
        metadata: registryPayload,
      }).returning();
      
      return { success: true, server };
    }
  } catch (error) {
    console.error('Error publishing claimed server:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to publish server' 
    };
  }
}

/**
 * Claim an existing unclaimed server
 */
export async function claimServer(serverUuid: string) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'You must be logged in to claim servers' };
    }

    // Get server details
    const server = await db.query.registryServersTable.findFirst({
      where: eq(registryServersTable.uuid, serverUuid),
    });

    if (!server) {
      return { success: false, error: 'Server not found' };
    }

    if (server.is_claimed) {
      return { success: false, error: 'This server has already been claimed' };
    }

    // Verify ownership
    const ownership = await verifyGitHubOwnership(session.user.id, server.repository_url);
    if (!ownership.isOwner) {
      // Create a claim request for manual review
      await db.insert(serverClaimRequestsTable).values({
        server_uuid: serverUuid,
        user_id: session.user.id,
        github_username: ownership.githubUsername,
        status: 'pending',
      });

      return { 
        success: false, 
        error: ownership.reason || 'Ownership verification failed. Your claim request has been submitted for review.',
        claimPending: true
      };
    }

    // Auto-approve if GitHub ownership matches
    // TODO: Fetch latest metadata from GitHub
    // TODO: Publish to registry
    
    // For now, just mark as claimed
    const [updated] = await db.update(registryServersTable)
      .set({
        is_claimed: true,
        claimed_by_user_id: session.user.id,
        claimed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(registryServersTable.uuid, serverUuid))
      .returning();

    // Create approved claim request for record
    await db.insert(serverClaimRequestsTable).values({
      server_uuid: serverUuid,
      user_id: session.user.id,
      github_username: ownership.githubUsername,
      status: 'approved',
      processed_at: new Date(),
    });

    return { 
      success: true, 
      server: updated,
      message: 'Server claimed successfully! You can now publish it to the registry.'
    };
  } catch (error) {
    console.error('Error claiming server:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to claim server' 
    };
  }
}

/**
 * Get user's claimable servers (servers they could claim based on GitHub ownership)
 */
export async function getClaimableServers(userId: string) {
  try {
    // Get user's GitHub account
    const githubAccount = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.userId, userId),
        eq(accounts.provider, 'github')
      ),
    });

    if (!githubAccount) {
      return { servers: [], message: 'Connect your GitHub account to see claimable servers' };
    }

    const githubUsername = githubAccount.providerAccountId;

    // Find unclaimed servers matching user's GitHub username
    const servers = await db.query.registryServersTable.findMany({
      where: and(
        eq(registryServersTable.github_owner, githubUsername),
        eq(registryServersTable.is_claimed, false)
      ),
    });

    return { servers, githubUsername };
  } catch (error) {
    console.error('Error getting claimable servers:', error);
    return { servers: [], error: 'Failed to fetch claimable servers' };
  }
}