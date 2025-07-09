'use server';

import { and,eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { accounts, registryServersTable, serverClaimRequestsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { PluggedinRegistryClient } from '@/lib/registry/pluggedin-registry-client';
import { inferTransportFromPackages,transformPluggedinRegistryToMcpIndex } from '@/lib/registry/registry-transformer';

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
 * Get user's GitHub OAuth token from connected accounts
 */
async function getUserGitHubToken(userId: string): Promise<string | null> {
  const githubAccount = await db.query.accounts.findFirst({
    where: and(
      eq(accounts.userId, userId),
      eq(accounts.provider, 'github')
    ),
  });

  return githubAccount?.access_token || null;
}

/**
 * Check if user has GitHub account connected
 */
export async function checkUserGitHubConnection() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { hasGitHub: false, error: 'Not authenticated' };
    }

    const githubToken = await getUserGitHubToken(session.user.id);
    if (!githubToken) {
      return { hasGitHub: false };
    }

    // Verify the token is still valid
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      return { hasGitHub: false, tokenExpired: true };
    }

    const userInfo = await response.json();
    return { 
      hasGitHub: true, 
      githubUsername: userInfo.login,
      githubId: userInfo.id
    };
  } catch (error) {
    console.error('Error checking GitHub connection:', error);
    return { hasGitHub: false, error: 'Failed to check GitHub connection' };
  }
}

/**
 * Check if user has GitHub account connected via registry OAuth
 * @deprecated Use checkUserGitHubConnection instead
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
    
    // Use the official transformer to convert registry data
    const transformedServer = transformPluggedinRegistryToMcpIndex(server);
    
    // Extract command, args, and envs from the transformed data
    const command = transformedServer.command;
    const args = transformedServer.args;
    const envArray = transformedServer.envs;
    
    // Convert env array to object format expected by createMcpServer
    const env: { [key: string]: string } = {};
    if (envArray && Array.isArray(envArray)) {
      envArray.forEach(envVar => {
        if (typeof envVar === 'object' && envVar.name) {
          env[envVar.name] = ''; // Default empty value, user will fill it in
        } else if (typeof envVar === 'string') {
          env[envVar] = ''; // If it's just a string, use it as the key
        }
      });
    }
    
    // Determine the transport type based on packages
    const transportType = inferTransportFromPackages(server.packages);
    const serverType = transportType === 'stdio' ? 'STDIO' : 
                      transportType === 'sse' ? 'SSE' : 'STREAMABLE_HTTP';

    // Import using existing mcp-servers action
    const { createMcpServer } = await import('./mcp-servers');
    
    const result = await createMcpServer({
      name: transformedServer.name, // Use the transformed display name
      profileUuid,
      description: server.description || '',
      command,
      args,
      env: Object.keys(env).length > 0 ? env : undefined,
      type: serverType as any,
      source: 'REGISTRY' as any,
      external_id: server.id,
    });

    if (result.success) {
      return { 
        success: true, 
        data: result.data,
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
    
    // Get user's GitHub token
    const githubToken = await getUserGitHubToken(session.user.id);
    if (!githubToken) {
      return {
        success: false,
        error: 'Please connect your GitHub account to publish servers',
        needsAuth: true
      };
    }
    
    // Verify ownership
    const ownership = await verifyGitHubOwnership(githubToken, validated.repositoryUrl);
    if (!ownership.isOwner) {
      return { 
        success: false, 
        error: ownership.reason || 'You must be the owner of this repository to publish it',
        needsAuth: ownership.needsAuth
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

    // Get user's GitHub token
    const githubToken = await getUserGitHubToken(session.user.id);
    if (!githubToken) {
      return {
        success: false,
        error: 'Please connect your GitHub account to claim servers',
        needsAuth: true
      };
    }
    
    // Verify ownership
    const ownership = await verifyGitHubOwnership(githubToken, server.repository_url);
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

interface WizardSubmissionData {
  // Repository info
  githubUrl: string;
  owner: string;
  repo: string;
  repoInfo?: {
    name: string;
    description?: string;
    private: boolean;
    defaultBranch: string;
    language?: string;
    stars: number;
  };
  
  // Claim decision
  shouldClaim?: boolean;
  
  // Environment variables
  configuredEnvVars?: Record<string, string>;
  detectedEnvVars?: Array<{
    name: string;
    description?: string;
    required: boolean;
    source: string;
  }>;
  
  // Transport configuration
  transportConfigs?: {
    [transport: string]: {
      command?: string;
      args?: string[];
      url?: string;
      packageName?: string;
      registry?: string;
      env?: Record<string, string>;
    };
  };
  
  // Final metadata
  finalDescription?: string;
  categories?: string[];
}

/**
 * Submit wizard data to the registry
 */
export async function submitWizardToRegistry(wizardData: WizardSubmissionData) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'You must be logged in to submit servers' };
    }

    // Validate required fields
    if (!wizardData.githubUrl || !wizardData.owner || !wizardData.repo) {
      return { success: false, error: 'Missing repository information' };
    }

    // Check if this is a claimed server
    if (wizardData.shouldClaim) {
      // Get user's GitHub token for ownership verification
      const githubToken = await getUserGitHubToken(session.user.id);
      if (!githubToken) {
        return {
          success: false,
          error: 'Please connect your GitHub account to claim servers',
          needsAuth: true
        };
      }
      
      // Verify ownership
      const ownership = await verifyGitHubOwnership(githubToken, wizardData.githubUrl);
      if (!ownership.isOwner) {
        return { 
          success: false, 
          error: ownership.reason || 'GitHub ownership verification failed',
          needsAuth: ownership.needsAuth
        };
      }
    }

    // Determine package information from transport configs
    const packages = [];
    if (wizardData.transportConfigs) {
      for (const [_transport, config] of Object.entries(wizardData.transportConfigs)) {
        if (config.packageName) {
          packages.push({
            registry_name: config.registry || 'npm',
            name: config.packageName,
            version: 'latest', // TODO: Get actual version
            environment_variables: wizardData.detectedEnvVars?.map(env => ({
              name: env.name,
              description: env.description || '',
              required: env.required
            })) || []
          });
        }
      }
    }

    // If no packages found, create a GitHub package
    if (packages.length === 0) {
      packages.push({
        registry_name: 'npm', // Default to npm since github is not supported
        name: `${wizardData.owner}/${wizardData.repo}`,
        version: 'latest',
        environment_variables: wizardData.detectedEnvVars?.map(env => ({
          name: env.name,
          description: env.description || '',
          required: env.required
        })) || []
      });
    }

    // Prepare submission data for publishClaimedServer
    const submissionData = {
      repositoryUrl: wizardData.githubUrl,
      description: wizardData.finalDescription || wizardData.repoInfo?.description || '',
      packageInfo: {
        registry: packages[0].registry_name === 'github' ? 'npm' : packages[0].registry_name as 'npm' | 'docker' | 'pypi',
        name: packages[0].name,
        version: packages[0].version,
      },
      environmentVariables: packages[0].environment_variables
    };

    // Submit using existing publishClaimedServer function
    const result = await publishClaimedServer(submissionData);
    
    if (result.success) {
      return {
        success: true,
        serverId: `io.github.${wizardData.owner}/${wizardData.repo}`,
        data: result.server
      };
    } else {
      return {
        success: false,
        error: result.error || 'Failed to submit to registry'
      };
    }
  } catch (error) {
    console.error('Error submitting wizard to registry:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to submit to registry' 
    };
  }
}