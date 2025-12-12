/**
 * Agent name validation policy module.
 *
 * Centralizes all DNS name validation rules and reserved name checks
 * for PAP agents to ensure consistent validation across the codebase.
 */

/**
 * Reserved agent names that cannot be used by users.
 * These are typically system routes, common subdomains, or infrastructure names.
 */
const RESERVED_AGENT_NAMES = new Set([
  // System routes
  'api',
  'app',
  'admin',
  'auth',
  'login',
  'logout',
  'register',
  'signup',
  'signin',
  'dashboard',
  'settings',
  'profile',
  'account',
  'user',
  'users',

  // Infrastructure
  'www',
  'mail',
  'smtp',
  'pop',
  'imap',
  'ftp',
  'ssh',
  'vpn',
  'proxy',
  'cdn',
  'static',
  'assets',
  'media',
  'images',
  'files',

  // Common subdomains
  'blog',
  'news',
  'help',
  'support',
  'docs',
  'documentation',
  'wiki',
  'forum',
  'community',
  'status',
  'health',
  'metrics',
  'monitor',
  'logs',

  // PAP specific
  'pap',
  'station',
  'satellite',
  'collector',
  'registry',
  'hub',
  'gateway',
  'proxy',
  'agent',
  'agents',
  'cluster',
  'clusters',
  'node',
  'nodes',

  // Generic
  'test',
  'testing',
  'dev',
  'development',
  'staging',
  'prod',
  'production',
  'demo',
  'example',
  'sample',
  'default',
  'system',
  'internal',
  'private',
  'public',
  'root',
  'null',
  'undefined',
  'true',
  'false',
]);

export type NameValidationResult =
  | { ok: true; normalizedName: string; dnsName: string }
  | { ok: false; message: string };

/**
 * Validate and normalize an agent name for DNS compatibility.
 *
 * @param rawName - The raw name input from the user
 * @returns Validation result with normalized name or error message
 *
 * Note: dns_name is now stored as just the subdomain label (e.g., "myagent")
 * The full domain (e.g., "myagent.is.plugged.in") is constructed in Kubernetes Ingress
 */
export function validateAgentName(
  rawName: unknown
): NameValidationResult {
  if (!rawName || typeof rawName !== 'string') {
    return { ok: false, message: 'Name is required' };
  }

  const normalizedName = rawName.toLowerCase().trim();

  // Length check (DNS label max is 63 chars)
  if (normalizedName.length < 2 || normalizedName.length > 63) {
    return { ok: false, message: 'Name must be between 2 and 63 characters' };
  }

  // DNS-safe character check
  const dnsNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
  if (!dnsNameRegex.test(normalizedName)) {
    return {
      ok: false,
      message:
        'Name must be DNS-safe: lowercase letters, numbers, and hyphens only. Must start and end with a letter or number.',
    };
  }

  // No consecutive hyphens (RFC 1123)
  if (normalizedName.includes('--')) {
    return { ok: false, message: 'Name cannot contain consecutive hyphens' };
  }

  // Reserved name check
  if (RESERVED_AGENT_NAMES.has(normalizedName)) {
    return {
      ok: false,
      message: `Name '${normalizedName}' is reserved and cannot be used`,
    };
  }

  return {
    ok: true,
    normalizedName,
    dnsName: normalizedName, // Store only subdomain, not full FQDN
  };
}

/**
 * Check if a name is reserved.
 */
export function isReservedName(name: string): boolean {
  return RESERVED_AGENT_NAMES.has(name.toLowerCase().trim());
}
