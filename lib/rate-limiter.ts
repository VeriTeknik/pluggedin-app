import { headers } from 'next/headers';
import { NextRequest } from 'next/server';

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  max: number;       // Maximum requests per window
  keyGenerator?: (req: NextRequest) => string | Promise<string>;
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// Rate limit store interface for different backends
interface RateLimitBackend {
  get(key: string): Promise<{ count: number; resetTime: number } | null>;
  set(key: string, value: { count: number; resetTime: number }): Promise<void>;
  increment(key: string): Promise<number>;
  delete(key: string): Promise<void>;
}

// In-memory store implementation
class MemoryRateLimitStore implements RateLimitBackend {
  private store: RateLimitStore = {};

  async get(key: string) {
    return this.store[key] || null;
  }

  async set(key: string, value: { count: number; resetTime: number }) {
    this.store[key] = value;
  }

  async increment(key: string): Promise<number> {
    if (this.store[key]) {
      this.store[key].count++;
      return this.store[key].count;
    }
    return 0;
  }

  async delete(key: string) {
    delete this.store[key];
  }

  cleanup() {
    const now = Date.now();
    Object.keys(this.store).forEach(key => {
      if (this.store[key].resetTime < now) {
        delete this.store[key];
      }
    });
  }
}

// Redis store implementation (optional)
class RedisRateLimitStore implements RateLimitBackend {
  private client: any;

  constructor(redisUrl: string) {
    // Lazy load Redis client
    try {
      const { createClient } = require('redis');
      this.client = createClient({ url: redisUrl });
      this.client.connect().catch(console.error);
    } catch (error) {
      console.error('[RateLimit] Redis client not available:', error);
      throw new Error('Redis client required but not installed. Run: npm install redis');
    }
  }

  async get(key: string) {
    try {
      const data = await this.client.get(`ratelimit:${key}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[RateLimit] Redis get error:', error);
      return null;
    }
  }

  async set(key: string, value: { count: number; resetTime: number }) {
    try {
      const ttl = Math.ceil((value.resetTime - Date.now()) / 1000);
      await this.client.setEx(`ratelimit:${key}`, ttl, JSON.stringify(value));
    } catch (error) {
      console.error('[RateLimit] Redis set error:', error);
    }
  }

  async increment(key: string): Promise<number> {
    try {
      return await this.client.incr(`ratelimit:${key}:count`);
    } catch (error) {
      console.error('[RateLimit] Redis increment error:', error);
      return 0;
    }
  }

  async delete(key: string) {
    try {
      await this.client.del(`ratelimit:${key}`);
    } catch (error) {
      console.error('[RateLimit] Redis delete error:', error);
    }
  }
}

// Initialize rate limit backend
let rateLimitBackend: RateLimitBackend;

if (process.env.REDIS_URL) {
  try {
    rateLimitBackend = new RedisRateLimitStore(process.env.REDIS_URL);
    console.log('[RateLimit] Using Redis backend for distributed rate limiting');
  } catch (error) {
    console.error('[RateLimit] Failed to initialize Redis, falling back to memory store');
    rateLimitBackend = new MemoryRateLimitStore();
  }
} else {
  rateLimitBackend = new MemoryRateLimitStore();

  // SECURITY WARNING: In-memory store is not safe for multi-instance deployments
  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️  [RateLimit] WARNING: Using in-memory rate limiting in production!');
    console.warn('⚠️  [RateLimit] This is NOT SAFE for multi-instance deployments.');
    console.warn('⚠️  [RateLimit] Configure REDIS_URL environment variable for distributed rate limiting.');
    console.warn('⚠️  [RateLimit] Install redis: npm install redis');
  }
}

// Legacy in-memory store for backward compatibility
const store: RateLimitStore = {};

// Clean up expired entries periodically (only for memory store)
if (rateLimitBackend instanceof MemoryRateLimitStore) {
  setInterval(() => {
    (rateLimitBackend as MemoryRateLimitStore).cleanup();
  }, 60000); // Clean every minute
}

// Legacy cleanup for backward compatibility
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach(key => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 60000);

/**
 * Default key generator using IP address
 */
async function defaultKeyGenerator(req: NextRequest): Promise<string> {
  const headersList = await headers();
  const forwardedFor = headersList.get('x-forwarded-for');
  const realIp = headersList.get('x-real-ip');
  const ip = forwardedFor?.split(',')[0] || realIp || 'unknown';
  
  return `${ip}:${req.nextUrl.pathname}`;
}

/**
 * Rate limiter middleware
 * Uses configured backend (Redis or in-memory)
 */
export function createRateLimiter(config: RateLimitConfig) {
  const { windowMs, max, keyGenerator = defaultKeyGenerator } = config;

  return async function rateLimit(req: NextRequest): Promise<{ allowed: boolean; limit: number; remaining: number; reset: number }> {
    const key = await keyGenerator(req);
    const now = Date.now();

    // Get or create rate limit entry from backend
    let entry = await rateLimitBackend.get(key);

    if (!entry || entry.resetTime < now) {
      // New window
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      await rateLimitBackend.set(key, entry);
    } else {
      // Increment existing entry
      entry.count++;
      await rateLimitBackend.set(key, entry);
    }

    const allowed = entry.count <= max;
    const remaining = Math.max(0, max - entry.count);

    return {
      allowed,
      limit: max,
      remaining,
      reset: entry.resetTime,
    };
  };
}

/**
 * Common rate limit configurations
 */
export const RateLimiters = {
  // Strict limit for authentication endpoints
  auth: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per 15 minutes
  }),
  
  // Standard API limit
  api: createRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
  }),
  
  // Relaxed limit for public endpoints
  public: createRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
  }),
  
  // Very strict for sensitive operations
  sensitive: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 requests per hour
  }),
  
  // Registry operations (OAuth, publishing)
  registry: createRateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20, // 20 requests per 5 minutes
  }),
  
  // Registry OAuth callback
  registryOAuth: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 OAuth attempts per 15 minutes
  }),

  // Force refresh operations
  forceRefresh: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 force refresh requests per hour
  }),
};

/**
 * Simple rate limiter for server actions
 * Uses configured backend (Redis or in-memory)
 */
export const rateLimiter = {
  check: async (key: string, max: number, windowSeconds: number) => {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const resetTime = now + windowMs;

    // Get or create rate limit entry from backend
    let entry = await rateLimitBackend.get(key);

    if (!entry || entry.resetTime < now) {
      // New window
      entry = { count: 1, resetTime };
      await rateLimitBackend.set(key, entry);
      return { success: true, remaining: max - 1, reset: Math.floor(windowSeconds) };
    }

    // Increment count
    entry.count++;
    await rateLimitBackend.set(key, entry);
    const allowed = entry.count <= max;
    const remaining = Math.max(0, max - entry.count);

    return {
      success: allowed,
      remaining,
      reset: Math.ceil((entry.resetTime - now) / 1000),
    };
  }
};