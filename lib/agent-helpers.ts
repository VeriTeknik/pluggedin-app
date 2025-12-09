/**
 * Shared helpers for agent API routes.
 *
 * Provides common authentication, agent loading, and response utilities
 * to reduce duplication across route handlers.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { agentsTable } from '@/db/schema';
import { authenticate } from '@/app/api/auth';

/** Successful auth result type. */
type AuthSuccess = Awaited<ReturnType<typeof authenticate>> & { error: null };

/**
 * Result type for loadAuthorizedAgent helper.
 */
export type LoadAgentResult =
  | {
      success: true;
      auth: AuthSuccess;
      agent: typeof agentsTable.$inferSelect;
    }
  | {
      success: false;
      response: NextResponse;
    };

/**
 * Load an agent with authentication and authorization checks.
 *
 * This helper consolidates the common pattern of:
 * 1. Authenticating the request
 * 2. Loading the agent by ID
 * 3. Verifying the agent belongs to the user's active profile
 * 4. Returning appropriate error responses
 *
 * @param request - The incoming request
 * @param agentId - The agent UUID from route params
 * @returns Either the authenticated context with agent, or an error response
 */
export async function loadAuthorizedAgent(
  request: Request,
  agentId: string
): Promise<LoadAgentResult> {
  // Authenticate request
  const auth = await authenticate(request);
  if (auth.error) {
    return { success: false, response: auth.error };
  }

  // Load agent with ownership check
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(
      and(
        eq(agentsTable.uuid, agentId),
        eq(agentsTable.profile_uuid, auth.activeProfile.uuid)
      )
    )
    .limit(1);

  if (!agent) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Agent not found' }, { status: 404 }),
    };
  }

  // auth.error is null at this point, so we can safely cast
  return {
    success: true,
    auth: auth as AuthSuccess,
    agent,
  };
}

/**
 * Build environment variables for agent deployment.
 *
 * @param opts - Configuration options
 * @returns Environment variable map
 */
export function buildAgentEnv(opts: {
  baseUrl: string;
  agentId: string;
  normalizedName: string;
  dnsName: string;
  apiKey: string;
  template?: {
    container_port?: number | null;
    env_schema?: { defaults?: Record<string, unknown> } | null;
  } | null;
  envOverrides?: Record<string, string | number | boolean> | null;
}): Record<string, string> {
  const { baseUrl, agentId, normalizedName, dnsName, apiKey, template, envOverrides } = opts;

  // Base environment variables
  const env: Record<string, string> = {
    // PAP Station connection
    PAP_STATION_URL: `${baseUrl}/api/agents`,
    PAP_AGENT_ID: agentId,
    PAP_AGENT_DNS: dnsName,
    PAP_AGENT_KEY: apiKey,

    // Plugged.in API access
    PLUGGEDIN_API_URL: `${baseUrl}/api`,
    PLUGGEDIN_API_KEY: apiKey,

    // Agent identity
    AGENT_NAME: normalizedName,
    AGENT_DNS_NAME: dnsName,

    // Container configuration
    PORT: String(template?.container_port || 3000),
  };

  // Apply template defaults
  if (template?.env_schema?.defaults) {
    for (const [key, value] of Object.entries(template.env_schema.defaults)) {
      if (!env[key]) {
        env[key] = String(value);
      }
    }
  }

  // Apply user overrides (highest priority)
  if (envOverrides) {
    for (const [key, value] of Object.entries(envOverrides)) {
      env[key] = String(value);
    }
  }

  return env;
}
