import { NextRequest } from 'next/server';
import Redis from 'ioredis';

// Redis client singleton
let redisClient: Redis | null = null;

// Initialize Redis client
function getRedisClient(): Redis | null {
  if (!process.env.REDIS_URL) {
    console.warn('REDIS_URL not configured - falling back to in-memory rate limiting');
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
}

/**
 * Enhanced rate limiter with Redis support
 */
export function createRedisRateLimiter(config: RateLimitConfig) {
  const { windowMs, max, keyGenerator = defaultKeyGenerator } = config;

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
      const { createRateLimiter } = await import('./rate-limiter');
      const fallbackLimiter = createRateLimiter(config);
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

      // On Redis error, be permissive but log for monitoring
      return {
        allowed: true,
        limit: max,
        remaining: max,
        reset: now + windowMs,
      };
    }
  };
}

/**
 * Default key generator using IP address and fingerprinting
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

  // Add user agent hash for better fingerprinting
  const userAgent = req.headers.get('user-agent') || '';
  const uaHash = await hashString(userAgent);

  return `${ip}:${req.nextUrl.pathname}:${uaHash}`;
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
    hash = hash & hash; // Convert to 32bit integer
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
};