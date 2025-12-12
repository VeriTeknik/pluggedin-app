/**
 * Shared UI utilities for PAP agent pages.
 *
 * Centralizes common types, fetchers, formatting helpers, and validation logic
 * to reduce duplication and ensure consistency across agent management pages.
 */

import { HEARTBEAT_INTERVALS as PAP_HEARTBEAT_INTERVALS } from '@/lib/pap-constants';

// ============================================================================
// Types
// ============================================================================

/**
 * Agent data returned from the API.
 */
export interface Agent {
  uuid: string;
  name: string;
  dns_name: string;
  state: string;
  access_level?: 'PRIVATE' | 'PUBLIC';
  template_uuid?: string;
  heartbeat_mode?: string;
  deployment_status?: string;
  created_at: string;
  provisioned_at?: string;
  activated_at?: string;
  terminated_at?: string;
  last_heartbeat_at?: string;
  kubernetes_namespace?: string;
  kubernetes_deployment?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Agent template from marketplace (listing view).
 */
export interface AgentTemplate {
  uuid: string;
  namespace: string;
  name: string;
  version: string;
  display_name: string;
  description: string;
  icon_url?: string;
  banner_url?: string;
  category?: string;
  tags?: string[];
  is_verified: boolean;
  is_featured: boolean;
  install_count: number;
  repository_url?: string;
  documentation_url?: string;
  created_at: string;
}

/**
 * Extended agent template with deployment details (detail view).
 */
export interface AgentTemplateDetail extends AgentTemplate {
  long_description?: string;
  docker_image: string;
  container_port?: number;
  health_endpoint?: string;
  env_schema?: {
    required?: string[];
    optional?: string[];
    defaults?: Record<string, string>;
  };
  deployment_count?: number;
  updated_at: string;
}

/**
 * Agent template categories for filtering.
 */
export const AGENT_CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'research', label: 'Research' },
  { value: 'productivity', label: 'Productivity' },
  { value: 'development', label: 'Development' },
  { value: 'communication', label: 'Communication' },
  { value: 'automation', label: 'Automation' },
] as const;

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Standard SWR fetcher for API requests.
 */
export async function fetcher<T = unknown>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch');
  return response.json();
}

// ============================================================================
// Heartbeat Intervals (PAP-RFC-001 §8.1)
// ============================================================================

/**
 * Heartbeat intervals per mode in milliseconds.
 * Re-exported from pap-constants for UI usage.
 */
export const HEARTBEAT_INTERVALS: Record<string, number> = {
  EMERGENCY: PAP_HEARTBEAT_INTERVALS.EMERGENCY,
  IDLE: PAP_HEARTBEAT_INTERVALS.IDLE,
  SLEEP: PAP_HEARTBEAT_INTERVALS.SLEEP,
};

/**
 * Default heartbeat interval (IDLE mode).
 */
export const DEFAULT_HEARTBEAT_INTERVAL = HEARTBEAT_INTERVALS.IDLE;

/**
 * Get effective heartbeat mode and interval with safe defaults.
 * Prevents NaN/undefined issues in interval calculations.
 */
export function getEffectiveHeartbeatConfig(mode: string | undefined | null): {
  effectiveMode: string;
  effectiveIntervalMs: number;
} {
  const effectiveMode = mode && mode in HEARTBEAT_INTERVALS ? mode : 'IDLE';
  const effectiveIntervalMs = HEARTBEAT_INTERVALS[effectiveMode] ?? DEFAULT_HEARTBEAT_INTERVAL;
  return { effectiveMode, effectiveIntervalMs };
}

// ============================================================================
// State Badge Utilities
// ============================================================================

/**
 * Get badge variant for agent state.
 */
export function getStateBadgeVariant(state: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (state) {
    case 'ACTIVE':
      return 'default';
    case 'PROVISIONED':
      return 'secondary';
    case 'DRAINING':
      return 'outline';
    case 'TERMINATED':
    case 'KILLED':
      return 'destructive';
    default:
      return 'secondary';
  }
}

/**
 * Check if agent state is archived (TERMINATED or KILLED).
 */
export function isArchivedState(state: string): boolean {
  return state === 'TERMINATED' || state === 'KILLED';
}

// ============================================================================
// Date/Time Formatting
// ============================================================================

/**
 * Format uptime in human readable format.
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

/**
 * Calculate time ago from timestamp.
 */
export function timeAgo(timestamp: string | null | undefined): string {
  if (!timestamp) return 'Never';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'Invalid Date';
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 0) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Format date safely.
 */
export function formatDate(timestamp: string | null | undefined): string {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'Invalid Date';
  return date.toLocaleString();
}

// ============================================================================
// Agent Name Validation
// ============================================================================

/**
 * Reserved agent names that cannot be used.
 * Must match backend validation in lib/agent-name-policy.ts.
 */
export const RESERVED_AGENT_NAMES = new Set([
  'api', 'app', 'www', 'web', 'mail', 'smtp', 'imap', 'pop', 'ftp', 'ssh', 'dns',
  'ns', 'ns1', 'ns2', 'ns3', 'mx', 'mx1', 'mx2', 'vpn', 'proxy', 'gateway', 'gw',
  'admin', 'administrator', 'root', 'system', 'sysadmin', 'webmaster', 'postmaster',
  'hostmaster', 'support', 'help', 'info', 'contact', 'sales', 'billing',
  'kubernetes', 'k8s', 'kube', 'cluster', 'node', 'pod', 'service', 'ingress',
  'traefik', 'nginx', 'envoy', 'istio', 'linkerd',
  'pap', 'station', 'satellite', 'control', 'control-plane', 'registry',
  'hub', 'gateway', 'proxy', 'mcp', 'hooks', 'telemetry', 'metrics', 'heartbeat',
  'pluggedin', 'plugged', 'is', 'a', 'focus', 'memory', 'demo', 'test', 'staging',
  'production', 'prod', 'dev', 'development', 'sandbox', 'preview',
  'localhost', 'local', 'internal', 'private', 'public', 'static', 'assets', 'cdn',
  'status', 'health', 'healthz', 'ready', 'readyz', 'live', 'livez',
  'auth', 'login', 'logout', 'signup', 'register', 'oauth', 'sso', 'callback',
  'default', 'null', 'undefined', 'void', 'none', 'empty', 'blank',
]);

/**
 * Validate agent name and return error message if invalid.
 * Note: Input is expected to already be normalized (lowercase, valid chars only)
 * since the input field applies these transformations on change.
 */
export function validateAgentName(name: string): string | null {
  const normalized = name.toLowerCase().trim();

  if (!normalized) {
    return null; // Empty is okay, will be caught by disabled button
  }

  if (normalized.length < 2) {
    return 'Name must be at least 2 characters';
  }

  if (normalized.length > 63) {
    return 'Name must be 63 characters or less';
  }

  const dnsNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
  if (!dnsNameRegex.test(normalized)) {
    if (/^-/.test(normalized) || /-$/.test(normalized)) {
      return 'Name cannot start or end with a hyphen';
    }
    if (/[^a-z0-9-]/.test(normalized)) {
      return 'Only lowercase letters, numbers, and hyphens allowed';
    }
    return 'Invalid name format';
  }

  if (normalized.includes('--')) {
    return 'Name cannot contain consecutive hyphens';
  }

  if (RESERVED_AGENT_NAMES.has(normalized)) {
    return `'${normalized}' is a reserved name`;
  }

  return null;
}

// ============================================================================
// Image URL Validation (Security)
// ============================================================================

/**
 * Allowed image URL protocols.
 * SECURITY: Only allow http/https to prevent javascript:, data:, and other XSS vectors.
 */
const ALLOWED_IMAGE_PROTOCOLS = ['https:', 'http:'];

/**
 * Allowed image hosting domains for template icons/banners.
 * SECURITY: Restrict to trusted domains to prevent SSRF and tracking pixels.
 */
const ALLOWED_IMAGE_DOMAINS = [
  'plugged.in',
  'is.plugged.in',
  'github.com',
  'raw.githubusercontent.com',
  'avatars.githubusercontent.com',
  'user-images.githubusercontent.com',
  'ghcr.io',
];

/**
 * Validate an image URL for safe rendering.
 * SECURITY: Prevents XSS via javascript:, data: URIs and restricts to trusted domains.
 *
 * @param url - The URL to validate
 * @param strictDomainCheck - If true, only allow ALLOWED_IMAGE_DOMAINS (default: true)
 * @returns true if the URL is safe to render, false otherwise
 */
export function isValidImageUrl(url: string | undefined | null, strictDomainCheck = true): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);

    // Check protocol (must be http or https)
    if (!ALLOWED_IMAGE_PROTOCOLS.includes(parsed.protocol)) {
      return false;
    }

    // SECURITY: Check for suspicious patterns in both original and decoded URL
    // This catches encoded XSS vectors like "javascript%3A" or "data%3A"
    const urlsToCheck = [url, url.toLowerCase()];
    try {
      urlsToCheck.push(decodeURIComponent(url));
      urlsToCheck.push(decodeURIComponent(url).toLowerCase());
    } catch {
      // Ignore decode errors - malformed encoding is also suspicious
    }

    const dangerousPatterns = ['javascript:', 'data:', 'vbscript:', 'file:'];
    for (const checkUrl of urlsToCheck) {
      for (const pattern of dangerousPatterns) {
        if (checkUrl.includes(pattern)) {
          return false;
        }
      }
    }

    // Strict domain check for production
    if (strictDomainCheck) {
      const hostname = parsed.hostname.toLowerCase();
      const isAllowed = ALLOWED_IMAGE_DOMAINS.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
      );
      if (!isAllowed) {
        return false;
      }
    }

    return true;
  } catch {
    // Invalid URL
    return false;
  }
}

// ============================================================================
// Marketplace Constants
// ============================================================================

/**
 * Default number of templates to fetch per page.
 */
export const DEFAULT_TEMPLATES_LIMIT = 50;

/**
 * Default container port for agents.
 */
export const DEFAULT_CONTAINER_PORT = 3000;

/**
 * SWR configuration options for marketplace pages.
 */
export const SWR_MARKETPLACE_CONFIG = {
  revalidateOnFocus: false,
  dedupingInterval: 2000,
} as const;
