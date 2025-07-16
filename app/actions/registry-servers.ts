'use server';

import { and,eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { accounts, McpServerSource,projectsTable, registryServersTable, serverClaimRequestsTable } from '@/db/schema';
import { withAuth, withProfileAuth } from '@/lib/auth-helpers';
import { PluggedinRegistryClient } from '@/lib/registry/pluggedin-registry-client';
import { inferTransportFromPackages,transformPluggedinRegistryToMcpIndex } from '@/lib/registry/registry-transformer';
import { getRegistryOAuthToken } from './registry-oauth-session';

// Additional validation schemas
const uuidSchema = z.string().uuid('Invalid UUID format');

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



// Helper function to extract GitHub owner and repo from URL
function extractGitHubInfo(url: string): { owner: string; repo: string } {
  const match = url.match(/^https:\/\/github\.com\/([^\/]+)\/([^\/]+)$/);
  if (!match) {
    throw new Error('Invalid GitHub URL');
  }
  
  const owner = match[1];
  const repo = match[2];
  
  // Validate GitHub username/repo format (alphanumeric, hyphens, underscores)
  const githubNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9\-_]{0,99}$/;
  
  if (!githubNamePattern.test(owner)) {
    throw new Error('Invalid GitHub owner name');
  }
  
  if (!githubNamePattern.test(repo)) {
    throw new Error('Invalid GitHub repository name');
  }
  
  return { owner, repo };
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
    return await withAuth(async (session) => {
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
    });
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
export async function verifyGitHubOwnership(registryToken: string | null, repoUrl: string) {
  try {
    const { owner } = extractGitHubInfo(repoUrl);
    
    // If no token provided, get it from server-side session
    let token = registryToken;
    if (!token) {
      const tokenResult = await getRegistryOAuthToken();
      if (!tokenResult.success || !tokenResult.oauthToken) {
        return { 
          isOwner: false, 
          reason: 'Please authenticate with GitHub to verify ownership',
          needsAuth: true 
        };
      }
      token = tokenResult.oauthToken;
    }

    // Check user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userResponse.ok) {
      return { 
        isOwner: false, 
        reason: 'Unable to verify ownership due to a technical error. Please re-authenticate with GitHub.',
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
        Authorization: `Bearer ${token}`,
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
      reason: `You don't have ownership access to the repository ${owner}. Only repository owners and organization members with admin access can publish servers.`,
      reasonParams: { owner, username: githubUsername }
    };
  } catch (error) {
    console.error('Error verifying GitHub ownership:', error);
    return { 
      isOwner: false, 
      reason: 'Unable to verify ownership due to a technical error. Please try again later.',
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
    // Validate input
    const validatedProfileUuid = uuidSchema.parse(profileUuid);
    
    return await withProfileAuth(validatedProfileUuid, async (session, profile) => {

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
    });
  } catch (error) {
    console.error('Error importing registry server:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to import server from registry' 
    };
  }
}


/**
 * Claim an existing unclaimed server
 */
export async function claimServer(serverUuid: string) {
  try {
    // Validate input
    const validatedServerUuid = uuidSchema.parse(serverUuid);
    
    return await withAuth(async (session) => {

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
    });
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
  
  // Current profile UUID from UI context
  currentProfileUuid?: string;
}

/**
 * Validate wizard data before submission
 */
function validateWizardData(wizardData: WizardSubmissionData) {
  if (!wizardData.githubUrl || !wizardData.owner || !wizardData.repo) {
    return { success: false, error: 'Missing repository information' };
  }
  return { success: true };
}

/**
 * Extract package information from wizard data
 */
function extractPackageInfo(wizardData: WizardSubmissionData) {
  const packages = [];
  
  if (wizardData.transportConfigs) {
    for (const [_transport, config] of Object.entries(wizardData.transportConfigs)) {
      if (config.packageName) {
        packages.push({
          registry_name: config.registry || 'npm',
          name: config.packageName,
          version: 'latest',
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
      registry_name: 'npm',
      name: `${wizardData.owner}/${wizardData.repo}`,
      version: 'latest',
      environment_variables: wizardData.detectedEnvVars?.map(env => ({
        name: env.name,
        description: env.description || '',
        required: env.required
      })) || []
    });
  }

  return packages;
}

/**
 * Detect transport configuration from wizard data
 */
function detectTransportConfig(wizardData: WizardSubmissionData) {
  let transportType = 'STDIO';
  let url: string | undefined;
  let streamableHTTPOptions: any | undefined;
  
  if (wizardData.transportConfigs) {
    const transportKeys = Object.keys(wizardData.transportConfigs);
    
    // Check for both formats (with hyphen and underscore)
    if (transportKeys.includes('streamable-http') || transportKeys.includes('STREAMABLE_HTTP') || transportKeys.includes('streamable_http')) {
      transportType = 'STREAMABLE_HTTP';
      const config = wizardData.transportConfigs['streamable-http'] || 
                   wizardData.transportConfigs['STREAMABLE_HTTP'] || 
                   wizardData.transportConfigs['streamable_http'];
      url = config.url;
      
      // Extract headers and options
      streamableHTTPOptions = {
        headers: (config as any).headers || {},
        sessionId: (config as any).sessionId
      };
      
      // Also check for headers in env (legacy support)
      if (config.env && !(config as any).headers) {
        const headers = Object.entries(config.env).reduce((acc, [key, value]) => {
          if (key.startsWith('HEADER_')) {
            acc[key.replace('HEADER_', '')] = value as string;
          }
          return acc;
        }, {} as Record<string, string>);
        
        if (Object.keys(headers).length > 0) {
          streamableHTTPOptions.headers = headers;
        }
      }
      
      // Add OAuth configuration if present
      if ((config as any).oauth) {
        streamableHTTPOptions.oauth = (config as any).oauth;
      }
    } else if (transportKeys.includes('sse') || transportKeys.includes('SSE')) {
      transportType = 'SSE';
      const config = wizardData.transportConfigs['sse'] || wizardData.transportConfigs['SSE'];
      url = config.url;
    }
  }
  
  // Fallback: check detectedTransportConfigs if transportConfigs doesn't have URL
  if (!url && (wizardData as any).detectedTransportConfigs) {
    for (const [transport, config] of Object.entries((wizardData as any).detectedTransportConfigs)) {
      if ((transport === 'streamable-http' || transport === 'detected-streamable') && (config as any).url) {
        transportType = 'STREAMABLE_HTTP';
        url = (config as any).url;
        streamableHTTPOptions = {
          headers: (config as any).headers || {},
          sessionId: (config as any).sessionId,
          oauth: (config as any).oauth
        };
        break;
      }
    }
  }
  
  return { transportType, url, streamableHTTPOptions };
}

/**
 * Create a community server in the local database
 */
async function createCommunityServer(
  wizardData: WizardSubmissionData,
  packages: any[],
  activeProfileUuid: string,
  userId: string
) {
  const { createMcpServer } = await import('./mcp-servers');
  const { transportType, url, streamableHTTPOptions } = detectTransportConfig(wizardData);
  
  // Fallback: determine based on packages if no transport config
  let finalTransportType = transportType;
  if (transportType === 'STDIO' && packages[0]?.registry_name === 'docker') {
    finalTransportType = 'STREAMABLE_HTTP';
  }
  
  const serverName = wizardData.repo;
  let command: string | undefined;
  let args: string[] | undefined;
  
  // Only set command/args for STDIO servers
  if (finalTransportType === 'STDIO') {
    command = packages[0]?.registry_name === 'npm' 
      ? 'npx' 
      : packages[0]?.registry_name === 'docker'
      ? 'docker'
      : 'python';
    
    args = packages[0]?.registry_name === 'npm'
      ? [`-y`, packages[0].name]
      : packages[0]?.registry_name === 'docker'
      ? ['run', packages[0].name]
      : ['-m', packages[0].name];
  }
  
  // Convert env vars to object format
  const env: { [key: string]: string } = {};
  wizardData.detectedEnvVars?.forEach(envVar => {
    env[envVar.name] = ''; // User will fill these in later
  });
  
  const createResult = await createMcpServer({
    name: serverName,
    profileUuid: activeProfileUuid,
    description: wizardData.finalDescription || wizardData.repoInfo?.description || '',
    command,
    args,
    env: Object.keys(env).length > 0 ? env : undefined,
    url,
    streamableHTTPOptions,
    type: finalTransportType as any,
    source: McpServerSource.COMMUNITY,
    external_id: `io.github.${wizardData.owner}/${wizardData.repo}`,
  });

  if (!createResult.success || !createResult.data) {
    return { 
      success: false, 
      error: createResult.error || 'Failed to create server' 
    };
  }

  // Prepare the template metadata for tracking
  const template: any = {
    name: serverName,
    description: wizardData.finalDescription || wizardData.repoInfo?.description || '',
    type: finalTransportType,
    repository_url: wizardData.githubUrl,
    github_owner: wizardData.owner,
    github_repo: wizardData.repo,
    packages: packages.map(pkg => ({
      registry_name: pkg.registry_name,
      name: pkg.name,
      version: pkg.version || 'latest',
      environment_variables: pkg.environment_variables
    }))
  };
  
  // Add transport-specific fields to the template
  if (finalTransportType === 'STDIO') {
    template.command = command;
    template.args = args;
    template.env = env;
  } else if (finalTransportType === 'STREAMABLE_HTTP' || finalTransportType === 'SSE') {
    template.url = url;
    if (streamableHTTPOptions) {
      template.streamableHTTPOptions = streamableHTTPOptions;
    }
  }
  
  // Save minimal info to registry servers table for tracking
  const [registryServer] = await db.insert(registryServersTable).values({
    registry_id: `community-${createResult.data.uuid}`,
    name: `io.github.${wizardData.owner}/${wizardData.repo}`,
    github_owner: wizardData.owner,
    github_repo: wizardData.repo,
    repository_url: wizardData.githubUrl,
    description: wizardData.finalDescription || wizardData.repoInfo?.description || '',
    is_claimed: false,
    is_published: false,
    metadata: template,
  }).returning();

  return {
    success: true,
    serverId: `io.github.${wizardData.owner}/${wizardData.repo}`,
    data: registryServer,
    mcpServerUuid: createResult.data.uuid,
    message: 'Community server created successfully!'
  };
}

/**
 * Fetch repository version from GitHub
 */
async function fetchRepositoryVersion(
  owner: string,
  repo: string,
  registryToken?: string
): Promise<{ repoId: string; version: string }> {
  // If no token provided, get it from server-side session
  let token = registryToken;
  if (!token) {
    const tokenResult = await getRegistryOAuthToken();
    if (!tokenResult.success || !tokenResult.oauthToken) {
      throw new Error('Authentication required to fetch repository version');
    }
    token = tokenResult.oauthToken;
  }
  let repoId = `${owner}/${repo}`;
  let packageVersion = '1.0.0'; // Default fallback
  
  try {
    // Get repository metadata
    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    if (repoResponse.ok) {
      const repoData = await repoResponse.json();
      repoId = repoData.id.toString(); // Use numeric ID
    }

    // Try to fetch version from package.json
    const packageResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/package.json`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    
    if (packageResponse.ok) {
      const packageData = await packageResponse.json();
      if (packageData.content) {
        const packageContent = JSON.parse(Buffer.from(packageData.content, 'base64').toString());
        if (packageContent.version) {
          packageVersion = packageContent.version;
        }
      }
    } else {
      // Try pyproject.toml for Python projects
      const pyprojectResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/pyproject.toml`, {
        headers: {
          'Authorization': `Bearer ${registryToken}`,
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
          }
        }
      } else {
        // Try Cargo.toml for Rust projects
        const cargoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/Cargo.toml`, {
          headers: {
            'Authorization': `Bearer ${registryToken}`,
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
            }
          }
        }
      }
    }
  } catch (_error) {
    // Silently fall back to defaults
  }
  
  return { repoId, version: packageVersion };
}

/**
 * Publish a claimed server to the registry
 */
async function publishClaimedServerToRegistry(
  wizardData: WizardSubmissionData,
  packages: any[],
  userId: string
) {
  // Get OAuth token from server-side session
  const tokenResult = await getRegistryOAuthToken();
  
  if (!tokenResult.success || !tokenResult.oauthToken) {
    return { 
      success: false, 
      error: 'Authentication required. Please authenticate with GitHub to publish to the registry.',
      needsAuth: true
    };
  }

  const registryToken = tokenResult.oauthToken;

  // Fetch repository version
  const { repoId, version } = await fetchRepositoryVersion(
    wizardData.owner,
    wizardData.repo,
    registryToken
  );
  
  const registryPayload = {
    name: `io.github.${wizardData.owner}/${wizardData.repo}`,
    description: wizardData.finalDescription || wizardData.repoInfo?.description || '',
    packages: [{
      registry_name: packages[0].registry_name || 'npm',
      name: packages[0].name || `${wizardData.repo}`,
      version: version,
      environment_variables: (wizardData.detectedEnvVars || []).map(env => ({
        name: env.name,
        description: env.description || `Environment variable ${env.name}`,
        is_required: env.required !== false,
        is_secret: false // Default to false unless we have specific information
      })),
      runtime_arguments: [] // Empty array as most MCP servers don't have runtime arguments
    }],
    repository: {
      url: wizardData.githubUrl,
      source: 'github',
      id: repoId
    },
    version_detail: {
      version: version,
    },
  };
  
  // Publish to registry
  const registryResponse = await fetch('https://registry.plugged.in/v0/publish', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${registryToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(registryPayload)
  });

  if (!registryResponse.ok) {
    const errorText = await registryResponse.text();
    
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
          const versionMatch = errorText.match(/existing version\s*[:=]\s*(\S+)/);
          const existingVersion = versionMatch ? versionMatch[1] : 'unknown';
          errorMessage = `Server already exists with version ${existingVersion}. To update, please increment the version in your package.json and try again.`;
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
  
  // Save to our database
  const [registryServer] = await db.insert(registryServersTable).values({
    registry_id: registryResult.id,
    name: wizardData.repo,
    github_owner: wizardData.owner,
    github_repo: wizardData.repo,
    repository_url: wizardData.githubUrl,
    description: wizardData.finalDescription || wizardData.repoInfo?.description || '',
    is_claimed: true,
    is_published: true,
    claimed_by_user_id: userId,
    claimed_at: new Date(),
    published_at: new Date(),
    metadata: registryPayload,
  }).returning();

  return {
    success: true,
    serverId: `io.github.${wizardData.owner}/${wizardData.repo}`,
    data: registryServer
  };
}

/**
 * Get or create active profile for user
 */
async function getActiveProfileUuid(
  userId: string,
  currentProfileUuid?: string
): Promise<{ success: boolean; profileUuid?: string; error?: string }> {
  if (currentProfileUuid) {
    return { success: true, profileUuid: currentProfileUuid };
  }
  
  const userProjects = await db.query.projectsTable.findMany({
    where: eq(projectsTable.user_id, userId),
    with: {
      profiles: true
    }
  });

  if (!userProjects.length || !userProjects[0].profiles.length) {
    return { success: false, error: 'No active profile found. Please create a profile first.' };
  }

  const activeProject = userProjects.find(p => p.active_profile_uuid) || userProjects[0];
  const profileUuid = activeProject.active_profile_uuid || activeProject.profiles[0].uuid;
  
  return { success: true, profileUuid };
}

/**
 * Submit wizard data to the registry
 */
export async function submitWizardToRegistry(wizardData: WizardSubmissionData) {
  try {
    return await withAuth(async (session) => {


    // Validate required fields
    if (!wizardData.githubUrl || !wizardData.owner || !wizardData.repo) {
      return { success: false, error: 'Missing repository information' };
    }

    // Check if this is a community server (not claimed)
    if (!wizardData.shouldClaim) {
      // Community servers are stored locally, no registry authentication needed
    }
    // Check if this is a claimed server
    else if (wizardData.shouldClaim) {
      // For claimed servers, ownership verification will be done using the registry OAuth token
      // The verifyGitHubOwnership function will retrieve the token from the server-side session
      const ownership = await verifyGitHubOwnership(null, wizardData.githubUrl);
      
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
        name: `${wizardData.owner}-${wizardData.repo}`, // Use hyphen instead of slash for npm compatibility
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

    // For community servers, save to frontend database instead of registry
    if (!wizardData.shouldClaim) {
      
      // Use the provided currentProfileUuid if available, otherwise find the active profile
      let activeProfileUuid: string;
      
      if (wizardData.currentProfileUuid) {
        // Use the profile UUID from the UI context
        activeProfileUuid = wizardData.currentProfileUuid;
      } else {
        // Fallback to finding the active profile from the database
        const userProjects = await db.query.projectsTable.findMany({
          where: eq(projectsTable.user_id, session.user.id),
          with: {
            profiles: true
          }
        });

        if (!userProjects.length || !userProjects[0].profiles.length) {
          return { success: false, error: 'No active profile found. Please create a profile first.' };
        }

        // Use the first profile or the active one
        const activeProject = userProjects.find(p => p.active_profile_uuid) || userProjects[0];
        activeProfileUuid = activeProject.active_profile_uuid || activeProject.profiles[0].uuid;
      }
      
      // First, create the MCP server in the local database
      const { createMcpServer } = await import('./mcp-servers');
      
      // Determine transport type from wizard transport configs
      let transportType = 'STDIO';
      let url: string | undefined;
      let streamableHTTPOptions: any | undefined;
      
      
      // Check if this is a Streamable HTTP or SSE server from transportConfigs
      if (wizardData.transportConfigs) {
        const transportKeys = Object.keys(wizardData.transportConfigs);
        
        // Check for both formats (with hyphen and underscore)
        if (transportKeys.includes('streamable-http') || transportKeys.includes('STREAMABLE_HTTP') || transportKeys.includes('streamable_http')) {
          transportType = 'STREAMABLE_HTTP';
          const config = wizardData.transportConfigs['streamable-http'] || 
                       wizardData.transportConfigs['STREAMABLE_HTTP'] || 
                       wizardData.transportConfigs['streamable_http'];
          url = config.url;
          
          // Extract headers and options
          streamableHTTPOptions = {
            headers: (config as any).headers || {},
            sessionId: (config as any).sessionId
          };
          
          // Also check for headers in env (legacy support)
          if (config.env && !(config as any).headers) {
            const headers = Object.entries(config.env).reduce((acc, [key, value]) => {
              if (key.startsWith('HEADER_')) {
                acc[key.replace('HEADER_', '')] = value as string;
              }
              return acc;
            }, {} as Record<string, string>);
            
            if (Object.keys(headers).length > 0) {
              streamableHTTPOptions.headers = headers;
            }
          }
          
          // Add OAuth configuration if present
          if ((config as any).oauth) {
            streamableHTTPOptions.oauth = (config as any).oauth;
          }
        } else if (transportKeys.includes('sse') || transportKeys.includes('SSE')) {
          transportType = 'SSE';
          const config = wizardData.transportConfigs['sse'] || wizardData.transportConfigs['SSE'];
          url = config.url;
        }
      }
      
      // Fallback: check detectedTransportConfigs if transportConfigs doesn't have URL
      if (!url && (wizardData as any).detectedTransportConfigs) {
        for (const [transport, config] of Object.entries((wizardData as any).detectedTransportConfigs)) {
          if ((transport === 'streamable-http' || transport === 'detected-streamable') && (config as any).url) {
            transportType = 'STREAMABLE_HTTP';
            url = (config as any).url;
            streamableHTTPOptions = {
              headers: (config as any).headers || {},
              sessionId: (config as any).sessionId,
              oauth: (config as any).oauth
            };
            break;
          }
        }
      }
      
      // Fallback: determine based on packages if no transport config
      if (transportType === 'STDIO' && packages[0]?.registry_name === 'docker') {
        transportType = 'STREAMABLE_HTTP';
      }
      
      // Create the server configuration - use just the repo name without owner
      const serverName = wizardData.repo;
      let command: string | undefined;
      let args: string[] | undefined;
      
      // Only set command/args for STDIO servers
      if (transportType === 'STDIO') {
        command = packages[0]?.registry_name === 'npm' 
          ? 'npx' 
          : packages[0]?.registry_name === 'docker'
          ? 'docker'
          : 'python';
        
        args = packages[0]?.registry_name === 'npm'
          ? [`-y`, packages[0].name]
          : packages[0]?.registry_name === 'docker'
          ? ['run', packages[0].name]
          : ['-m', packages[0].name];
      }
      
      // Convert env vars to object format
      const env: { [key: string]: string } = {};
      wizardData.detectedEnvVars?.forEach(envVar => {
        env[envVar.name] = ''; // User will fill these in later
      });
      
      const createResult = await createMcpServer({
        name: serverName,
        profileUuid: activeProfileUuid,
        description: wizardData.finalDescription || wizardData.repoInfo?.description || '',
        command,
        args,
        env: Object.keys(env).length > 0 ? env : undefined,
        url,
        streamableHTTPOptions,
        type: transportType as any,
        source: McpServerSource.COMMUNITY,
        external_id: `io.github.${wizardData.owner}/${wizardData.repo}`,
      });

      if (!createResult.success || !createResult.data) {
        return { 
          success: false, 
          error: createResult.error || 'Failed to create server' 
        };
      }

      // For community servers, automatically share them to make them visible
      const { shareMcpServer } = await import('./social');
      const shareResult = await shareMcpServer(
        activeProfileUuid,
        createResult.data.uuid,
        serverName,
        wizardData.finalDescription || wizardData.repoInfo?.description || '',
        true, // isPublic = true for community servers
        {
          name: serverName,
          description: wizardData.finalDescription || wizardData.repoInfo?.description || '',
          type: transportType,
          command,
          args,
          env: Object.keys(env).length > 0 ? env : undefined,
          url,
          streamableHTTPOptions,
          repository_url: wizardData.githubUrl,
          github_owner: wizardData.owner,
          github_repo: wizardData.repo,
        }
      );

      if (!shareResult.success) {
        console.error('Failed to share community server:', shareResult.error);
        // Don't fail the whole operation if sharing fails
      }
      
      // Prepare the template metadata for tracking
      const template: any = {
        name: serverName,
        description: wizardData.finalDescription || wizardData.repoInfo?.description || '',
        type: transportType,
        repository_url: wizardData.githubUrl,
        github_owner: wizardData.owner,
        github_repo: wizardData.repo,
        packages: packages.map(pkg => ({
          registry_name: pkg.registry_name,
          name: pkg.name,
          version: pkg.version || 'latest',
          environment_variables: pkg.environment_variables
        }))
      };
      
      // Add transport-specific fields to the template
      if (transportType === 'STDIO') {
        template.command = command;
        template.args = args;
        template.env = env;
      } else if (transportType === 'STREAMABLE_HTTP' || transportType === 'SSE') {
        template.url = url;
        if (streamableHTTPOptions) {
          template.streamableHTTPOptions = streamableHTTPOptions;
        }
      }
      
      // Save minimal info to registry servers table for tracking
      const [registryServer] = await db.insert(registryServersTable).values({
        registry_id: `community-${createResult.data.uuid}`, // Use created server UUID as registry ID
        name: `io.github.${wizardData.owner}/${wizardData.repo}`,
        github_owner: wizardData.owner,
        github_repo: wizardData.repo,
        repository_url: wizardData.githubUrl,
        description: wizardData.finalDescription || wizardData.repoInfo?.description || '',
        is_claimed: false, // Community server
        is_published: false, // Not published to registry, only to frontend
        metadata: template,
      }).returning();

      return {
        success: true,
        serverId: `io.github.${wizardData.owner}/${wizardData.repo}`,
        data: registryServer,
        mcpServerUuid: createResult.data.uuid,
        message: 'Community server created successfully!'
      };
    }
    // For claimed servers, use the publishClaimedServerToRegistry function
    else if (wizardData.shouldClaim) {
      const result = await publishClaimedServerToRegistry(wizardData, packages, session.user.id);
      
      if (result.success) {
        return {
          success: true,
          serverId: result.serverId,
          data: result.data
        };
      } else {
        return {
          success: false,
          error: result.error,
          needsAuth: result.needsAuth
        };
      }
    }
    });
  } catch (error) {
    console.error('Error submitting wizard to registry:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to submit to registry' 
    };
  }
}