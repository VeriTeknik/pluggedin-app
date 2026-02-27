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
  private connected: boolean = false;

  constructor(redisUrl: string) {
    // Lazy load Redis client - gracefully handle if not installed
    try {
      // Dynamic import to avoid build-time errors - using ioredis
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Redis = require('ioredis');
      this.client = new Redis(redisUrl, {
        retryStrategy: (times: number) => {
          if (times > 3) return null;
          return Math.min(times * 50, 2000);
        },
        maxRetriesPerRequest: 3,
        lazyConnect: false,
      });

      this.client.on('connect', () => {
        this.connected = true;
        console.log('[RateLimit] Redis connected successfully');
      });

      this.client.on('error', (error: Error) => {
        console.error('[RateLimit] Redis connection failed:', error.message);
        this.connected = false;
      });

      this.client.on('ready', () => {
        this.connected = true;
      });
    } catch (error) {
      // This typically happens in Edge Runtime where Node.js APIs aren't available
      console.warn('[RateLimit] Cannot load ioredis (likely Edge Runtime limitation, not missing package)');
      console.warn('[RateLimit] Falling back to in-memory rate limiting for this context');
      this.connected = false;
      throw error; // Re-throw to trigger fallback to memory store
    }
  }

  async get(key: string) {
    if (!this.connected) return null;
    try {
      const data = await this.client.get(`ratelimit:${key}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[RateLimit] Redis get error:', error);
      return null;
    }
  }

  async set(key: string, value: { count: number; resetTime: number }) {
    if (!this.connected) return;
    try {
      const ttl = Math.ceil((value.resetTime - Date.now()) / 1000);
      await this.client.setex(`ratelimit:${key}`, ttl, JSON.stringify(value));
    } catch (error) {
      console.error('[RateLimit] Redis set error:', error);
    }
  }

  async increment(key: string): Promise<number> {
    if (!this.connected) return 0;
    try {
      return await this.client.incr(`ratelimit:${key}:count`);
    } catch (error) {
      console.error('[RateLimit] Redis increment error:', error);
      return 0;
    }
  }

  async delete(key: string) {
    if (!this.connected) return;
    try {
      await this.client.del(`ratelimit:${key}`);
    } catch (error) {
      console.error('[RateLimit] Redis delete error:', error);
    }
  }
}

// Check if Redis module is available
function isRedisAvailable(): boolean {
  try {
    require.resolve('ioredis');
    return true;
  } catch {
    return false;
  }
}

// Initialize rate limit backend
let rateLimitBackend: RateLimitBackend;

if (process.env.REDIS_URL) {
  if (isRedisAvailable()) {
    try {
      rateLimitBackend = new RedisRateLimitStore(process.env.REDIS_URL);
      console.log('[RateLimit] Using Redis backend for distributed rate limiting');
    } catch (error) {
      console.error('[RateLimit] Failed to initialize Redis, falling back to memory store');
      rateLimitBackend = new MemoryRateLimitStore();
    }
  } else {
    console.warn('⚠️  [RateLimit] REDIS_URL configured but ioredis cannot be loaded');
    console.warn('⚠️  [RateLimit] This is normal in Edge Runtime contexts');
    console.warn('⚠️  [RateLimit] Falling back to in-memory rate limiting for this context');
    rateLimitBackend = new MemoryRateLimitStore();
  }
} else {
  rateLimitBackend = new MemoryRateLimitStore();

  // SECURITY WARNING: In-memory store is not safe for multi-instance deployments
  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️  [RateLimit] WARNING: Using in-memory rate limiting in production!');
    console.warn('⚠️  [RateLimit] This is NOT SAFE for multi-instance deployments.');
    console.warn('⚠️  [RateLimit] Configure REDIS_URL environment variable for distributed rate limiting.');
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
 * Uses req.headers directly for Edge Runtime compatibility (middleware)
 */
function defaultKeyGenerator(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
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