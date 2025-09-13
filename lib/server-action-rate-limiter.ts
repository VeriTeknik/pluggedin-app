/**
 * Rate limiter for server actions with user-based tracking
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitStore {
  [key: string]: RateLimitEntry;
}

// In-memory store for rate limiting
// TODO: CRITICAL - Replace with Redis for production deployment
// Current in-memory implementation will NOT work across multiple server instances
// This can lead to rate limit bypass if running multiple Node.js processes
// Implementation required:
// 1. Install Redis client (ioredis or node-redis)
// 2. Use Redis INCR with TTL for atomic counter operations
// 3. Handle Redis connection failures gracefully (fallback to strict limits)
// 4. Consider using Redis Cluster for high availability
// Reference: https://github.com/animir/node-rate-limiter-flexible
const store: RateLimitStore = {};

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach(key => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 60000); // Clean every minute

export interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  max: number;       // Maximum requests per window
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number; // Seconds until rate limit resets
}

/**
 * Rate limiter for server actions
 * @param userId - The authenticated user ID
 * @param action - The action being performed (e.g., 'update-server', 'create-server')
 * @param config - Rate limit configuration
 */
export async function rateLimitServerAction(
  userId: string,
  action: string,
  config: RateLimitConfig = { windowMs: 60000, max: 10 } // Default: 10 requests per minute
): Promise<RateLimitResult> {
  const key = `${userId}:${action}`;
  const now = Date.now();
  
  // Get or create rate limit entry
  if (!store[key] || store[key].resetTime < now) {
    store[key] = {
      count: 0,
      resetTime: now + config.windowMs,
    };
  }
  
  const entry = store[key];
  entry.count++;
  
  const allowed = entry.count <= config.max;
  const remaining = Math.max(0, config.max - entry.count);
  const retryAfter = allowed ? undefined : Math.ceil((entry.resetTime - now) / 1000);
  
  return {
    allowed,
    limit: config.max,
    remaining,
    reset: entry.resetTime,
    retryAfter,
  };
}

/**
 * Get rate limit from environment or use defaults
 */
function getRateLimit(envPrefix: string, defaultWindow: number, defaultMax: number): RateLimitConfig {
  const windowEnv = process.env[`${envPrefix}_WINDOW_MS`];
  const windowMs = windowEnv ? parseInt(windowEnv, 10) : defaultWindow;

  const maxEnv = process.env[`${envPrefix}_MAX`];
  const max = maxEnv ? parseInt(maxEnv, 10) : defaultMax;

  return { windowMs, max };
}

/**
 * Common rate limit configurations for MCP server actions
 * Can be overridden via environment variables:
 * - RATE_LIMIT_SERVER_MOD_WINDOW_MS / RATE_LIMIT_SERVER_MOD_MAX
 * - RATE_LIMIT_SERVER_READ_WINDOW_MS / RATE_LIMIT_SERVER_READ_MAX
 * - RATE_LIMIT_SENSITIVE_WINDOW_MS / RATE_LIMIT_SENSITIVE_MAX
 * - RATE_LIMIT_DISCOVERY_WINDOW_MS / RATE_LIMIT_DISCOVERY_MAX
 */
export const ServerActionRateLimits = {
  // Server modifications (create, update, delete)
  serverModification: getRateLimit('RATE_LIMIT_SERVER_MOD', 60000, 10),

  // Server reads (get, list)
  serverRead: getRateLimit('RATE_LIMIT_SERVER_READ', 60000, 60),

  // Sensitive operations (encryption key operations, bulk updates)
  sensitive: getRateLimit('RATE_LIMIT_SENSITIVE', 3600000, 10),

  // Discovery operations (tool discovery)
  discovery: getRateLimit('RATE_LIMIT_DISCOVERY', 60000, 5),
};

/**
 * Format rate limit error message
 */
export function formatRateLimitError(result: RateLimitResult): string {
  if (result.retryAfter) {
    return `Rate limit exceeded. Please try again in ${result.retryAfter} seconds.`;
  }
  return 'Rate limit exceeded. Please try again later.';
}