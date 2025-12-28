'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db';
import { agentTemplatesTable, users } from '@/db/schema';
import { getAdminEmails } from '@/lib/admin-notifications';
import { getAuthSession } from '@/lib/auth';

type ActionResult<T = void> = {
  success: boolean;
  data?: T;
  error?: string;
};

interface DockerTag {
  name: string;
  updated_at: string;
}

/**
 * Parse docker image to extract registry, owner/org, and package name
 * Example: ghcr.io/veriteknik/compass-agent:latest
 * Returns: { registry: 'ghcr.io', owner: 'veriteknik', package: 'compass-agent' }
 */
function parseDockerImage(dockerImage: string): {
  registry: string;
  owner: string;
  package: string;
} | null {
  try {
    // Remove tag if present
    const imageWithoutTag = dockerImage.split(':')[0];
    const parts = imageWithoutTag.split('/');

    if (parts.length < 3) {
      return null;
    }

    const [registry, owner, ...packageParts] = parts;
    const packageName = packageParts.join('/');

    return { registry, owner, package: packageName };
  } catch {
    return null;
  }
}

/**
 * Check if the current user is an admin.
 * Returns user info if admin, null otherwise.
 */
async function checkAdminAuth(): Promise<{ userId: string; email: string } | null> {
  const session = await getAuthSession();

  if (!session?.user?.email || !session?.user?.id) {
    return null;
  }

  // Check database for admin status first
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  let isAdmin = user?.is_admin || false;

  // Fallback to environment variable check
  if (!isAdmin) {
    const adminEmails = getAdminEmails();
    isAdmin = adminEmails.includes(session.user.email);
  }

  if (!isAdmin) {
    return null;
  }

  return { userId: session.user.id, email: session.user.email };
}

/**
 * Fetch available versions/tags from GitHub Container Registry
 *
 * Authentication:
 * - Uses GITHUB_PACKAGES_TOKEN (recommended), GITHUB_PAT, or GITHUB_TOKEN from environment variables
 * - For public packages: authentication is optional but recommended (higher rate limits)
 * - For private packages: authentication with read:packages scope is required
 *
 * Required GitHub Token Type & Scopes:
 * - Must be a CLASSIC token (fine-grained tokens don't fully support Packages API)
 * - read:packages - Read packages and their metadata
 *
 * To create a classic token:
 * 1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
 * 2. Generate new token (classic)
 * 3. Select scope: ✅ read:packages
 * 4. Add to .env: GITHUB_PACKAGES_TOKEN=ghp_your_token
 *
 * Note: If you're using a fine-grained token for GITHUB_PAT, create a separate classic
 * token for packages and set it as GITHUB_PACKAGES_TOKEN
 */
export async function fetchDockerImageVersions(
  dockerImage: string
): Promise<ActionResult<DockerTag[]>> {
  try {
    const admin = await checkAdminAuth();
    if (!admin) {
      return { success: false, error: 'Unauthorized - Admin access required' };
    }

    const parsed = parseDockerImage(dockerImage);
    if (!parsed) {
      return { success: false, error: 'Invalid docker image format' };
    }

    // Only support ghcr.io for now
    if (parsed.registry !== 'ghcr.io') {
      return {
        success: false,
        error: 'Only GitHub Container Registry (ghcr.io) is supported',
      };
    }

    // GitHub Packages API endpoint
    // Try both org and user endpoints since we don't know which one it is
    const endpoints = [
      `https://api.github.com/orgs/${parsed.owner}/packages/container/${parsed.package}/versions`,
      `https://api.github.com/users/${parsed.owner}/packages/container/${parsed.package}/versions`,
    ];

    const headers: HeadersInit = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    // Add authentication - prioritize dedicated packages token, fallback to general tokens
    // GITHUB_PACKAGES_TOKEN: Classic token specifically for packages (recommended)
    // GITHUB_PAT: General purpose token (may be fine-grained)
    // GITHUB_TOKEN: Fallback general purpose token
    const githubToken =
      process.env.GITHUB_PACKAGES_TOKEN ||
      process.env.GITHUB_PAT ||
      process.env.GITHUB_TOKEN;
    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    let versions: any[] = [];
    let lastError: Error | null = null;

    // Try both endpoints
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { headers });

        if (response.ok) {
          versions = await response.json();
          break;
        } else if (response.status === 404) {
          // Try next endpoint
          continue;
        } else {
          const errorText = await response.text();
          lastError = new Error(`GitHub API error: ${response.status} - ${errorText}`);
        }
      } catch (error) {
        lastError = error as Error;
        continue;
      }
    }

    if (versions.length === 0) {
      if (lastError) {
        console.error('Failed to fetch versions:', lastError);
      }
      return {
        success: false,
        error:
          lastError?.message ||
          'Could not fetch versions. Package may be private or does not exist.',
      };
    }

    // Extract tags from versions
    const tags: DockerTag[] = versions
      .flatMap((version: any) => {
        // Each version can have multiple tags
        return (version.metadata?.container?.tags || []).map((tag: string) => ({
          name: tag,
          updated_at: version.updated_at,
        }));
      })
      .filter((tag: DockerTag) => tag.name) // Filter out empty tags
      .sort((a: DockerTag, b: DockerTag) => {
        // Sort by updated_at descending (newest first)
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });

    // Remove duplicates (keep the most recent)
    const uniqueTags = Array.from(
      new Map(tags.map((tag) => [tag.name, tag])).values()
    );

    return { success: true, data: uniqueTags };
  } catch (error) {
    console.error('Failed to fetch docker image versions:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch versions',
    };
  }
}

/**
 * Update an agent template's version and/or docker image
 */
export async function updateAgentTemplate(
  templateId: string,
  updates: {
    version?: string;
    dockerImage?: string;
  }
): Promise<ActionResult> {
  try {
    const admin = await checkAdminAuth();
    if (!admin) {
      return { success: false, error: 'Unauthorized - Admin access required' };
    }

    // Find the template
    const template = await db.query.agentTemplatesTable.findFirst({
      where: eq(agentTemplatesTable.uuid, templateId),
    });

    if (!template) {
      return { success: false, error: 'Template not found' };
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date(),
    };

    if (updates.version) {
      updateData.version = updates.version;
    }

    if (updates.dockerImage) {
      updateData.docker_image = updates.dockerImage;
    }

    // Update template
    await db
      .update(agentTemplatesTable)
      .set(updateData)
      .where(eq(agentTemplatesTable.uuid, templateId));

    revalidatePath('/admin/agent-templates');
    return { success: true };
  } catch (error) {
    console.error('Failed to update agent template:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update template',
    };
  }
}

/**
 * Toggle template flags (is_public, is_verified, is_featured)
 */
export async function toggleTemplateFlag(
  templateId: string,
  flag: 'is_public' | 'is_verified' | 'is_featured',
  value: boolean
): Promise<ActionResult> {
  try {
    const admin = await checkAdminAuth();
    if (!admin) {
      return { success: false, error: 'Unauthorized - Admin access required' };
    }

    // Find the template
    const template = await db.query.agentTemplatesTable.findFirst({
      where: eq(agentTemplatesTable.uuid, templateId),
    });

    if (!template) {
      return { success: false, error: 'Template not found' };
    }

    // Update flag
    await db
      .update(agentTemplatesTable)
      .set({
        [flag]: value,
        updated_at: new Date(),
      })
      .where(eq(agentTemplatesTable.uuid, templateId));

    revalidatePath('/admin/agent-templates');
    return { success: true };
  } catch (error) {
    console.error('Failed to toggle template flag:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to toggle flag',
    };
  }
}
