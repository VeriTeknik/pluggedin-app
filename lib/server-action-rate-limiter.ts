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
// TODO: In production, use Redis for distributed systems
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
 * Common rate limit configurations for MCP server actions
 */
export const ServerActionRateLimits = {
  // Server modifications (create, update, delete)
  serverModification: {
    windowMs: 60000,  // 1 minute
    max: 10,          // 10 operations per minute
  },
  
  // Server reads (get, list)
  serverRead: {
    windowMs: 60000,  // 1 minute
    max: 60,          // 60 reads per minute
  },
  
  // Sensitive operations (encryption key operations, bulk updates)
  sensitive: {
    windowMs: 3600000, // 1 hour
    max: 10,           // 10 operations per hour
  },
  
  // Discovery operations (tool discovery)
  discovery: {
    windowMs: 60000,  // 1 minute
    max: 5,           // 5 discoveries per minute
  },
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