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
 * Protected environment variable prefixes that cannot be overwritten by users.
 * These are set by the system and required for agent operation.
 */
const PROTECTED_ENV_PREFIXES = ['PAP_', 'PLUGGEDIN_', 'AGENT_'];

/**
 * Protected individual environment variable names.
 */
const PROTECTED_ENV_KEYS = new Set(['PORT', 'NODE_ENV', 'HOME', 'PATH', 'USER']);

/**
 * Validate an environment variable key.
 * Returns error message if invalid, null if valid.
 */
export function validateEnvKey(key: string): string | null {
  // Must be non-empty
  if (!key || key.trim() === '') {
    return 'Environment variable key cannot be empty';
  }

  // POSIX standard: [A-Za-z_][A-Za-z0-9_]*
  const validEnvKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
  if (!validEnvKeyPattern.test(key)) {
    return `Invalid environment variable key '${key}'. Must start with a letter or underscore and contain only letters, numbers, and underscores.`;
  }

  // Check protected individual keys
  if (PROTECTED_ENV_KEYS.has(key)) {
    return `Environment variable '${key}' is protected and cannot be overwritten`;
  }

  // Check protected prefixes
  for (const prefix of PROTECTED_ENV_PREFIXES) {
    if (key.startsWith(prefix)) {
      return `Environment variables starting with '${prefix}' are protected and cannot be overwritten`;
    }
  }

  return null;
}

/**
 * Maximum size for individual environment variable values.
 */
const MAX_ENV_VALUE_SIZE = 8192; // 8KB

/**
 * Sanitize an environment variable value.
 * Removes control characters and truncates to max size.
 */
function sanitizeEnvValue(value: unknown): string {
  const str = String(value ?? '');
  // Remove ASCII control characters (except tab, newline, carriage return which may be intentional)
  const sanitized = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Truncate to max size
  return sanitized.slice(0, MAX_ENV_VALUE_SIZE);
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

  // Apply template defaults (sanitize values, skip protected keys)
  if (template?.env_schema?.defaults) {
    for (const [key, value] of Object.entries(template.env_schema.defaults)) {
      // Skip if already set or key is protected
      if (!env[key] && validateEnvKey(key) === null) {
        env[key] = sanitizeEnvValue(value);
      }
    }
  }

  // Apply user overrides (highest priority, sanitize values)
  // Note: Key validation should happen at API layer before calling this function
  if (envOverrides) {
    for (const [key, value] of Object.entries(envOverrides)) {
      // Double-check protection even though API should validate
      if (validateEnvKey(key) === null) {
        env[key] = sanitizeEnvValue(value);
      }
    }
  }

  return env;
}
