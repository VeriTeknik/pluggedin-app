import Redis from 'ioredis';
import { NextRequest } from 'next/server';

import { createRateLimiter as createInMemoryRateLimiter } from './rate-limiter';

// Redis client singleton
let redisClient: Redis | null = null;

// In-memory fallback store for Redis failures
const inMemoryFallback = new Map<string, { count: number; resetTime: number }>();

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of inMemoryFallback.entries()) {
    if (value.resetTime <= now) {
      inMemoryFallback.delete(key);
    }
  }
}, 60000); // Clean up every minute

// Initialize Redis client
function getRedisClient(): Redis | null {
  if (!process.env.REDIS_URL) {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      console.error('[CRITICAL] REDIS_URL not configured in production - rate limiting will be inconsistent across instances!');
      // Consider failing closed in production for security
      // throw new Error('Redis is required for rate limiting in production');
    } else {
      console.warn('REDIS_URL not configured - falling back to in-memory rate limiting');
    }
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL, {
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 50, 2000);
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      console.error('Redis rate limiter error:', err);
    });
  }

  return redisClient;
}

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  max: number;       // Maximum requests per window
  keyGenerator?: (req: NextRequest) => string | Promise<string>;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  failClosed?: boolean;  // If true, deny all requests when Redis fails (secure default)
  fallbackMultiplier?: number;  // Reduce limits during fallback (default 0.5 = 50% of normal)
}

/**
 * Enhanced rate limiter with Redis support
 */
export function createRedisRateLimiter(config: RateLimitConfig) {
  const {
    windowMs,
    max,
    keyGenerator = defaultKeyGenerator,
    failClosed = process.env.NODE_ENV === 'production',
    fallbackMultiplier = 0.5
  } = config;

  return async function rateLimit(req: NextRequest): Promise<{
    allowed: boolean;
    limit: number;
    remaining: number;
    reset: number;
    retryAfter?: number;
  }> {
    const redis = getRedisClient();

    // Fallback to in-memory if Redis is not available
    if (!redis) {
      // In production, consider failing closed for security
      if (failClosed) {
        console.error('[SECURITY] Redis unavailable - failing closed to prevent abuse');
        return {
          allowed: false,
          limit: max,
          remaining: 0,
          reset: Date.now() + windowMs,
          retryAfter: Math.ceil(windowMs / 1000)
        };
      }

      // Use stricter limits during fallback
      const fallbackConfig = {
        ...config,
        max: Math.floor(max * fallbackMultiplier)
      };
      const fallbackLimiter = createInMemoryRateLimiter(fallbackConfig);
      return fallbackLimiter(req);
    }

    const key = await keyGenerator(req);
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const redisKey = `ratelimit:${key}:${windowStart}`;

    try {
      // Use Redis pipeline for atomic operations
      const pipeline = redis.pipeline();
      pipeline.incr(redisKey);
      pipeline.expire(redisKey, Math.ceil(windowMs / 1000));

      const results = await pipeline.exec();

      if (!results || results.length < 2) {
        throw new Error('Redis pipeline failed');
      }

      const [[, count]] = results as [[null, number], [null, number]];
      const allowed = count <= max;
      const remaining = Math.max(0, max - count);
      const reset = windowStart + windowMs;

      return {
        allowed,
        limit: max,
        remaining,
        reset,
        retryAfter: allowed ? undefined : Math.ceil((reset - now) / 1000),
      };
    } catch (error) {
      console.error('Redis rate limit error:', error);

      // Fail closed in production for security
      if (failClosed) {
        console.error('[SECURITY] Redis error - failing closed to prevent abuse');
        return {
          allowed: false,
          limit: max,
          remaining: 0,
          reset: windowStart + windowMs,
          retryAfter: Math.ceil(windowMs / 1000)
        };
      }

      // Use stricter in-memory fallback during Redis failures
      const fallbackMax = Math.floor(max * fallbackMultiplier);
      const fallbackKey = `fallback:${key}:${windowStart}`;
      const fallbackEntry = inMemoryFallback.get(fallbackKey);
      const resetTime = windowStart + windowMs;

      if (!fallbackEntry || fallbackEntry.resetTime <= now) {
        // New window with stricter limits
        inMemoryFallback.set(fallbackKey, { count: 1, resetTime });
        return {
          allowed: true,
          limit: fallbackMax,
          remaining: fallbackMax - 1,
          reset: resetTime,
        };
      }

      // Increment count with stricter limits
      fallbackEntry.count++;
      const allowed = fallbackEntry.count <= fallbackMax;
      const remaining = Math.max(0, fallbackMax - fallbackEntry.count);

      return {
        allowed,
        limit: fallbackMax,
        remaining,
        reset: resetTime,
        retryAfter: allowed ? undefined : Math.ceil((resetTime - now) / 1000),
      };
    }
  };
}

/**
 * Default key generator using IP address only
 * User-agent removed to prevent bypass through rotation
 * For sensitive endpoints, this provides better security
 */
async function defaultKeyGenerator(req: NextRequest): Promise<string> {
  const forwardedFor = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const cfConnectingIp = req.headers.get('cf-connecting-ip'); // Cloudflare

  // Get the most reliable IP
  const ip = cfConnectingIp ||
             forwardedFor?.split(',')[0]?.trim() ||
             realIp ||
             'unknown';

  // Use IP and pathname only - no user agent to prevent bypass
  return `${ip}:${req.nextUrl.pathname}`;
}

/**
 * Simple hash function for fingerprinting
 */
async function hashString(str: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback for environments without crypto.subtle
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Enhanced rate limit configurations with Redis support
 */
export const EnhancedRateLimiters = {
  // Strict limit for authentication endpoints
  auth: createRedisRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per 15 minutes
  }),

  // Login-specific with progressive delays
  login: createRedisRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3, // 3 attempts per 15 minutes
    skipSuccessfulRequests: true, // Don't count successful logins
  }),

  // Password reset rate limiting
  passwordReset: createRedisRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 requests per hour
  }),

  // Standard API limit
  api: createRedisRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
  }),

  // AI document creation
  aiDocument: createRedisRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 AI documents per hour
  }),

  // File upload rate limiting
  upload: createRedisRateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // 10 uploads per 5 minutes
  }),

  // Sensitive data access
  sensitive: createRedisRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 requests per hour
  }),

  // PAP Agent rate limits
  agentCreate: createRedisRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 agent creations per hour (resource intensive)
  }),

  agentList: createRedisRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 list requests per minute
  }),

  agentRead: createRedisRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120, // 120 reads per minute (individual agent + status polling)
  }),

  agentUpdate: createRedisRateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30, // 30 updates per 5 minutes
  }),

  agentDelete: createRedisRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 deletions per hour
  }),

  agentLifecycle: createRedisRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 lifecycle operations per minute (state changes)
  }),

  // Heartbeat-specific: Higher limit for EMERGENCY mode (5s intervals = 12/min per agent)
  agentHeartbeat: createRedisRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120, // 120 heartbeats per minute (supports multiple agents in EMERGENCY mode)
  }),

  // Metrics: Lower limit since they're typically sent every 60s
  agentMetrics: createRedisRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 metrics submissions per minute
  }),

  // Export/replicate/upgrade: Resource-intensive operations
  agentIntensive: createRedisRateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // 10 intensive operations per 5 minutes
  }),
};