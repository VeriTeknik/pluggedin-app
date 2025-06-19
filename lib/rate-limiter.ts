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

// In-memory store for rate limiting
// In production, use Redis or similar for distributed systems
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
 */
export function createRateLimiter(config: RateLimitConfig) {
  const { windowMs, max, keyGenerator = defaultKeyGenerator } = config;
  
  return async function rateLimit(req: NextRequest): Promise<{ allowed: boolean; limit: number; remaining: number; reset: number }> {
    const key = await keyGenerator(req);
    const now = Date.now();
    
    // Get or create rate limit entry
    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 0,
        resetTime: now + windowMs,
      };
    }
    
    const entry = store[key];
    entry.count++;
    
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
};