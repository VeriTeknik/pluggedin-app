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
import { MAX_MEMORY_GI, MAX_CPU_CORES } from '@/lib/pap-constants';

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

// ============================================================================
// Container Image Validation
// ============================================================================

/**
 * Allowed container image registries.
 * SECURITY: Only allow images from trusted registries to prevent malicious code execution.
 *
 * Note: Add registries as needed. Consider making this configurable via env var.
 */
const ALLOWED_IMAGE_REGISTRIES = [
  // Official Docker Hub libraries
  'docker.io/library/',
  'library/',  // Short form for docker.io/library/
  // NGINX
  'nginxinc/',
  'docker.io/nginxinc/',
  // GitHub Container Registry (org-specific)
  'ghcr.io/veritektik/',
  'ghcr.io/pluggedin/',
  // Allow images without registry prefix (Docker Hub official images)
  // These get normalized to docker.io/library/
];

/**
 * Validate a container image reference.
 * SECURITY: Prevents pulling images from untrusted registries.
 *
 * @param image - Container image reference (e.g., "nginx:alpine", "ghcr.io/org/image:v1")
 * @returns Error message if invalid, null if valid
 */
export function validateContainerImage(image: string): string | null {
  if (!image || typeof image !== 'string') {
    return 'Image must be a non-empty string';
  }

  // Trim and normalize
  const normalizedImage = image.trim().toLowerCase();

  if (normalizedImage.length === 0) {
    return 'Image must be a non-empty string';
  }

  // Check for obviously malicious patterns
  if (normalizedImage.includes('..') || normalizedImage.includes('//')) {
    return 'Invalid image reference format';
  }

  // Check if image matches any allowed registry
  // Allow env override for additional registries
  const additionalRegistries = (process.env.PAP_ALLOWED_IMAGE_REGISTRIES || '')
    .split(',')
    .filter(r => r.trim());
  const allAllowedRegistries = [...ALLOWED_IMAGE_REGISTRIES, ...additionalRegistries];

  const isAllowed = allAllowedRegistries.some(registry =>
    normalizedImage.startsWith(registry.toLowerCase())
  );

  // SECURITY: Simple image detection is restrictive to prevent bypass
  // Only allow images with NO slash (Docker Hub official library images like "nginx", "redis")
  // Images with slashes MUST match an explicit allowed registry to prevent
  // "malicious-registry/image" from being allowed as a "simple" namespace/image
  const isOfficialLibraryImage = !normalizedImage.includes('/');

  if (!isAllowed && !isOfficialLibraryImage) {
    return `Image must be from an allowed registry. Allowed: ${ALLOWED_IMAGE_REGISTRIES.slice(0, 3).join(', ')}...`;
  }

  // Additional validation for official library images (no slashes)
  // Must match pattern: [a-z0-9]+([._-][a-z0-9]+)*(:[a-z0-9._-]+)?(@sha256:[a-f0-9]+)?
  if (isOfficialLibraryImage) {
    const validOfficialPattern = /^[a-z0-9]+([._-][a-z0-9]+)*(:[a-z0-9._-]+)?(@sha256:[a-f0-9]+)?$/;
    if (!validOfficialPattern.test(normalizedImage)) {
      return 'Invalid image name format';
    }
  }

  return null;
}

// ============================================================================
// Resource Limits Validation
// ============================================================================

// MAX_MEMORY_GI and MAX_CPU_CORES are imported from pap-constants.ts
// They can be configured via PAP_MAX_MEMORY_GI and PAP_MAX_CPU_CORES env vars

/**
 * Parse a Kubernetes memory resource string to bytes.
 * Supports: Ki, Mi, Gi, Ti (binary) and K, M, G, T (decimal)
 */
function parseK8sMemory(value: string): number | null {
  const match = value.match(/^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|K|M|G|T)?$/i);
  if (!match) return null;

  const num = parseFloat(match[1]);
  const unit = (match[2] || '').toLowerCase();

  const multipliers: Record<string, number> = {
    '': 1,
    'k': 1000,
    'm': 1000 * 1000,
    'g': 1000 * 1000 * 1000,
    't': 1000 * 1000 * 1000 * 1000,
    'ki': 1024,
    'mi': 1024 * 1024,
    'gi': 1024 * 1024 * 1024,
    'ti': 1024 * 1024 * 1024 * 1024,
  };

  return num * (multipliers[unit] || 1);
}

/**
 * Parse a Kubernetes CPU resource string to millicores.
 * Supports: fractional (0.5), integer (2), millicores (500m)
 */
function parseK8sCpu(value: string): number | null {
  const match = value.match(/^(\d+(?:\.\d+)?)(m)?$/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  const isMillicores = match[2] === 'm';

  return isMillicores ? num : num * 1000;
}

/**
 * Validate Kubernetes resource limits.
 * SECURITY: Prevents resource exhaustion by enforcing maximum limits.
 *
 * @param resources - Resource specification object
 * @returns Error message if invalid, null if valid
 */
export function validateResourceLimits(resources: {
  cpu_request?: string;
  cpu_limit?: string;
  memory_request?: string;
  memory_limit?: string;
} | undefined | null): string | null {
  if (!resources) return null;

  const maxMemoryBytes = MAX_MEMORY_GI * 1024 * 1024 * 1024;
  const maxCpuMillicores = MAX_CPU_CORES * 1000;

  // Validate memory
  for (const field of ['memory_request', 'memory_limit'] as const) {
    const value = resources[field];
    if (value) {
      const bytes = parseK8sMemory(value);
      if (bytes === null) {
        return `Invalid ${field} format: ${value}`;
      }
      if (bytes > maxMemoryBytes) {
        return `${field} exceeds maximum of ${MAX_MEMORY_GI}Gi`;
      }
    }
  }

  // Validate CPU
  for (const field of ['cpu_request', 'cpu_limit'] as const) {
    const value = resources[field];
    if (value) {
      const millicores = parseK8sCpu(value);
      if (millicores === null) {
        return `Invalid ${field} format: ${value}`;
      }
      if (millicores > maxCpuMillicores) {
        return `${field} exceeds maximum of ${MAX_CPU_CORES} cores`;
      }
    }
  }

  // Validate request <= limit
  if (resources.memory_request && resources.memory_limit) {
    const requestBytes = parseK8sMemory(resources.memory_request);
    const limitBytes = parseK8sMemory(resources.memory_limit);
    if (requestBytes && limitBytes && requestBytes > limitBytes) {
      return 'memory_request cannot exceed memory_limit';
    }
  }

  if (resources.cpu_request && resources.cpu_limit) {
    const requestMillicores = parseK8sCpu(resources.cpu_request);
    const limitMillicores = parseK8sCpu(resources.cpu_limit);
    if (requestMillicores && limitMillicores && requestMillicores > limitMillicores) {
      return 'cpu_request cannot exceed cpu_limit';
    }
  }

  return null;
}

// ============================================================================
// Sensitive Data Redaction
// ============================================================================

/**
 * Keys that indicate sensitive data (case-insensitive partial match).
 */
const SENSITIVE_KEY_PATTERNS = [
  'api_key',
  'apikey',
  'secret',
  'token',
  'password',
  'passwd',
  'credential',
  'private',
  'auth',
  'bearer',
  'jwt',
  'session',
  'cookie',
];

/**
 * Redact sensitive fields from metadata.
 * SECURITY: Prevents information disclosure in export/debug endpoints.
 *
 * @param metadata - Object that may contain sensitive data
 * @returns New object with sensitive values replaced by [REDACTED]
 */
export function redactSensitiveMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!metadata) return {};

  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEY_PATTERNS.some(pattern =>
      lowerKey.includes(pattern)
    );

    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively redact nested objects
      redacted[key] = redactSensitiveMetadata(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      // Redact sensitive values in arrays of objects
      redacted[key] = value.map(item =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? redactSensitiveMetadata(item as Record<string, unknown>)
          : item
      );
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

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
