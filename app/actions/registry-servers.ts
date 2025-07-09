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
  registryToken?: string;
  githubUsername?: string;
  
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
    console.log('🔍 submitWizardToRegistry: Starting with data:', {
      shouldClaim: wizardData.shouldClaim,
      registryToken: wizardData.registryToken ? `${wizardData.registryToken.substring(0, 10)}...` : 'undefined',
      githubUsername: wizardData.githubUsername,
      githubUrl: wizardData.githubUrl,
      owner: wizardData.owner,
      repo: wizardData.repo
    });

    const session = await getAuthSession();
    if (!session?.user?.id) {
      console.log('🔍 submitWizardToRegistry: No session found');
      return { success: false, error: 'You must be logged in to submit servers' };
    }

    console.log('🔍 submitWizardToRegistry: Session found for user:', session.user.id);

    // Validate required fields
    if (!wizardData.githubUrl || !wizardData.owner || !wizardData.repo) {
      console.log('🔍 submitWizardToRegistry: Missing repository information');
      return { success: false, error: 'Missing repository information' };
    }

    // Check if this is a community server (not claimed)
    if (!wizardData.shouldClaim) {
      console.log('🔍 submitWizardToRegistry: This is a community server, using REGISTRY_AUTH_TOKEN');
      
      // For community servers, we use the REGISTRY_AUTH_TOKEN from environment
      const registryAuthToken = process.env.REGISTRY_AUTH_TOKEN;
      if (!registryAuthToken) {
        console.log('🔍 submitWizardToRegistry: REGISTRY_AUTH_TOKEN not configured');
        return { success: false, error: 'Registry authentication not configured. Please contact the administrator.' };
      }
      
      // Skip to submission for community servers
      console.log('🔍 submitWizardToRegistry: Proceeding with community server submission');
    }
    // Check if this is a claimed server - ONLY do ownership verification if we don't have a registry token
    else if (wizardData.shouldClaim && !wizardData.registryToken) {
      console.log('🔍 submitWizardToRegistry: This is a claimed server without registry token, using NextAuth flow...');
      
      // Fall back to NextAuth token
      const nextAuthToken = await getUserGitHubToken(session.user.id);
      const githubToken = nextAuthToken || undefined;
      console.log('🔍 submitWizardToRegistry: NextAuth token:', githubToken ? `${githubToken.substring(0, 10)}...` : 'undefined');
      
      if (!githubToken) {
        console.log('🔍 submitWizardToRegistry: No GitHub token available, returning error');
        return {
          success: false,
          error: 'Please connect your GitHub account to claim servers',
          needsAuth: true
        };
      }
      
      console.log('🔍 submitWizardToRegistry: Verifying GitHub ownership...');
      // Verify ownership
      const ownership = await verifyGitHubOwnership(githubToken, wizardData.githubUrl);
      console.log('🔍 submitWizardToRegistry: Ownership verification result:', ownership);
      
      if (!ownership.isOwner) {
        console.log('🔍 submitWizardToRegistry: Ownership verification failed');
        return { 
          success: false, 
          error: ownership.reason || 'GitHub ownership verification failed',
          needsAuth: ownership.needsAuth
        };
      }
      
      console.log('🔍 submitWizardToRegistry: Ownership verification passed');
    } else if (wizardData.shouldClaim && wizardData.registryToken) {
      console.log('🔍 submitWizardToRegistry: This is a claimed server WITH registry token, skipping ownership verification (already done during OAuth)');
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

    // For community servers, use REGISTRY_AUTH_TOKEN
    if (!wizardData.shouldClaim) {
      console.log('🔍 submitWizardToRegistry: Submitting community server with REGISTRY_AUTH_TOKEN');
      
      const registryAuthToken = process.env.REGISTRY_AUTH_TOKEN;
      if (!registryAuthToken) {
        return { success: false, error: 'Registry authentication not configured. Please contact the administrator.' };
      }
      
      // Prepare registry payload for community server
      const registryPayload = {
        name: `io.github.${wizardData.owner}/${wizardData.repo}`,
        description: wizardData.finalDescription || wizardData.repoInfo?.description || '',
        packages: [{
          registry_name: packages[0].registry_name || 'npm',
          name: packages[0].name || `${wizardData.repo}`,
          version: '1.0.0', // Community servers typically use latest
          environment_variables: (wizardData.detectedEnvVars || []).map(env => ({
            name: env.name,
            description: env.description || `Environment variable ${env.name}`,
            required: env.required
          }))
        }],
        repository: {
          url: wizardData.githubUrl,
          source: 'github',
          id: `${wizardData.owner}/${wizardData.repo}`
        },
        version_detail: {
          version: '1.0.0',
        },
      };
      
      console.log('🔍 submitWizardToRegistry: Community server payload:', JSON.stringify(registryPayload, null, 2));
      
      // Submit to /v0/servers/community endpoint as per APP_INTEGRATION_GUIDE.md
      const registryResponse = await fetch('https://registry.plugged.in/v0/servers/community', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${registryAuthToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(registryPayload)
      });
      
      console.log('🔍 submitWizardToRegistry: Community server API response status:', registryResponse.status);
      
      if (!registryResponse.ok) {
        const errorText = await registryResponse.text();
        console.log('🔍 submitWizardToRegistry: Community server API error:', errorText);
        
        // Provide specific error messages based on status code
        let errorMessage: string;
        switch (registryResponse.status) {
          case 401:
            errorMessage = 'Registry authentication failed. Please contact the administrator.';
            break;
          case 409:
            errorMessage = 'This server is already published to the registry.';
            break;
          case 422:
            errorMessage = `Invalid data: ${errorText}`;
            break;
          default:
            errorMessage = `Registry publication failed (${registryResponse.status}): ${errorText || registryResponse.statusText}`;
        }
        
        return {
          success: false,
          error: errorMessage
        };
      }
      
      const registryResult = await registryResponse.json();
      console.log('🔍 submitWizardToRegistry: Community server success response:', JSON.stringify(registryResult, null, 2));
      
      // Save to our database
      const [registryServer] = await db.insert(registryServersTable).values({
        registry_id: registryResult.id,
        name: `io.github.${wizardData.owner}/${wizardData.repo}`,
        github_owner: wizardData.owner,
        github_repo: wizardData.repo,
        repository_url: wizardData.githubUrl,
        description: wizardData.finalDescription || wizardData.repoInfo?.description || '',
        is_claimed: false, // Community server
        is_published: true,
        published_at: new Date(),
        metadata: registryPayload,
      }).returning();

      return {
        success: true,
        serverId: `io.github.${wizardData.owner}/${wizardData.repo}`,
        data: registryServer
      };
    }
    // For claimed servers, publish directly to registry using the registry token
    else if (wizardData.shouldClaim && wizardData.registryToken) {
      console.log('🔍 submitWizardToRegistry: Using direct registry API call with registry token');
      
      // Fetch GitHub repository ID and version from the repository
      let repoId = `${wizardData.owner}/${wizardData.repo}`;
      let packageVersion = '1.0.0'; // Default fallback
      
      try {
        // Get repository metadata
        const repoResponse = await fetch(`https://api.github.com/repos/${wizardData.owner}/${wizardData.repo}`, {
          headers: {
            'Authorization': `Bearer ${wizardData.registryToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        });
        if (repoResponse.ok) {
          const repoData = await repoResponse.json();
          repoId = repoData.id.toString(); // Use numeric ID
          console.log('🔍 submitWizardToRegistry: Fetched repository ID:', repoId);
        }

        // Try to fetch version from package.json
        const packageResponse = await fetch(`https://api.github.com/repos/${wizardData.owner}/${wizardData.repo}/contents/package.json`, {
          headers: {
            'Authorization': `Bearer ${wizardData.registryToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        });
        
        if (packageResponse.ok) {
          const packageData = await packageResponse.json();
          if (packageData.content) {
            const packageContent = JSON.parse(Buffer.from(packageData.content, 'base64').toString());
            if (packageContent.version) {
              packageVersion = packageContent.version;
              console.log('🔍 submitWizardToRegistry: Fetched version from package.json:', packageVersion);
            }
          }
        } else {
          console.log('🔍 submitWizardToRegistry: No package.json found, checking for pyproject.toml...');
          
          // Try pyproject.toml for Python projects
          const pyprojectResponse = await fetch(`https://api.github.com/repos/${wizardData.owner}/${wizardData.repo}/contents/pyproject.toml`, {
            headers: {
              'Authorization': `Bearer ${wizardData.registryToken}`,
              'Accept': 'application/vnd.github.v3+json',
            },
          });
          
          if (pyprojectResponse.ok) {
            const pyprojectData = await pyprojectResponse.json();
            if (pyprojectData.content) {
              const pyprojectContent = Buffer.from(pyprojectData.content, 'base64').toString();
              const versionMatch = pyprojectContent.match(/version\s*=\s*["']([^"']+)["']/);
              if (versionMatch) {
                packageVersion = versionMatch[1];
                console.log('🔍 submitWizardToRegistry: Fetched version from pyproject.toml:', packageVersion);
              }
            }
          } else {
            console.log('🔍 submitWizardToRegistry: No pyproject.toml found, checking for Cargo.toml...');
            
            // Try Cargo.toml for Rust projects
            const cargoResponse = await fetch(`https://api.github.com/repos/${wizardData.owner}/${wizardData.repo}/contents/Cargo.toml`, {
              headers: {
                'Authorization': `Bearer ${wizardData.registryToken}`,
                'Accept': 'application/vnd.github.v3+json',
              },
            });
            
            if (cargoResponse.ok) {
              const cargoData = await cargoResponse.json();
              if (cargoData.content) {
                const cargoContent = Buffer.from(cargoData.content, 'base64').toString();
                const versionMatch = cargoContent.match(/version\s*=\s*["']([^"']+)["']/);
                if (versionMatch) {
                  packageVersion = versionMatch[1];
                  console.log('🔍 submitWizardToRegistry: Fetched version from Cargo.toml:', packageVersion);
                }
              }
            }
          }
        }
      } catch (error) {
        console.log('🔍 submitWizardToRegistry: Could not fetch repo metadata, using fallbacks:', { repoId, packageVersion });
      }
      
      // Use registry token to publish directly - match official MCP registry format exactly
      const finalVersion = packageVersion;
      
      const registryPayload = {
        name: `io.github.${wizardData.owner}/${wizardData.repo}`,
        description: wizardData.finalDescription || wizardData.repoInfo?.description || '',
        packages: [{
          registry_name: packages[0].registry_name || 'npm',
          name: packages[0].name || `${wizardData.repo}`,
          version: finalVersion, // Use actual or bumped version
          environment_variables: (wizardData.detectedEnvVars || []).map(env => ({
            name: env.name,
            description: env.description || `Environment variable ${env.name}`,
            required: env.required
          }))
        }],
        repository: {
          url: wizardData.githubUrl,
          source: 'github',
          id: repoId // Use fetched numeric ID
        },
        version_detail: {
          version: finalVersion, // Use actual or bumped version
        },
      };
      
      console.log('🔍 submitWizardToRegistry: Using package version:', packageVersion);

      console.log('🔍 submitWizardToRegistry: Registry payload:', JSON.stringify(registryPayload, null, 2));

      // Publish to registry using registry client with direct token auth
      console.log('🔍 submitWizardToRegistry: Making direct API call to registry...');
      
      // For claimed servers, use /v0/publish endpoint
      const registryResponse = await fetch('https://registry.plugged.in/v0/publish', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${wizardData.registryToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(registryPayload)
      });

      console.log('🔍 submitWizardToRegistry: Registry API response status:', registryResponse.status);

      if (!registryResponse.ok) {
        const errorText = await registryResponse.text();
        console.log('🔍 submitWizardToRegistry: Registry API error:', errorText);
        
        // Provide specific error messages based on status code
        let errorMessage: string;
        switch (registryResponse.status) {
          case 401:
            errorMessage = 'Authentication failed. Please re-authenticate with GitHub.';
            break;
          case 403:
            errorMessage = 'Permission denied. You may not have admin access to this repository.';
            break;
          case 409:
            errorMessage = 'This server is already published to the registry.';
            break;
          case 422:
            errorMessage = `Invalid data: ${errorText}`;
            break;
          case 500:
            if (errorText.includes('version must be greater')) {
              // Parse the current version and suggest incrementing it
              const versionMatch = errorText.match(/existing version\s*[:=]\s*(\S+)/);
              const existingVersion = versionMatch ? versionMatch[1] : 'unknown';
              errorMessage = `Server already exists with version ${existingVersion}. To update, please increment the version in your package.json and try again.`;
              console.log('🔍 submitWizardToRegistry: Version conflict detected. Existing version:', existingVersion);
            } else {
              errorMessage = `Registry server error: ${errorText}`;
            }
            break;
          default:
            errorMessage = `Registry publication failed (${registryResponse.status}): ${errorText || registryResponse.statusText}`;
        }
        
        return {
          success: false,
          error: errorMessage
        };
      }

      const registryResult = await registryResponse.json();
      console.log('🔍 submitWizardToRegistry: Registry API success response:', JSON.stringify(registryResult, null, 2));
      
      // Save to our database
      const [registryServer] = await db.insert(registryServersTable).values({
        registry_id: registryResult.id,
        name: `io.github.${wizardData.owner}/${wizardData.repo}`,
        github_owner: wizardData.owner,
        github_repo: wizardData.repo,
        repository_url: wizardData.githubUrl,
        description: wizardData.finalDescription || wizardData.repoInfo?.description || '',
        is_claimed: true,
        is_published: true,
        claimed_by_user_id: session.user.id,
        claimed_at: new Date(),
        published_at: new Date(),
        metadata: registryPayload,
      }).returning();

      return {
        success: true,
        serverId: `io.github.${wizardData.owner}/${wizardData.repo}`,
        data: registryServer
      };
    } else {
      // Fall back to existing publishClaimedServer function for NextAuth flow
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
    }
  } catch (error) {
    console.error('Error submitting wizard to registry:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to submit to registry' 
    };
  }
}