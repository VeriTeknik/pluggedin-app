import { NextRequest, NextResponse } from 'next/server';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
}

// TODO: Implement Redis-backed rate limiting for production
// Current in-memory store won't work in distributed deployments with multiple instances
// Consider using:
// - Redis with node-redis client
// - rate-limit-redis package
// - Or other distributed caching solutions
// This is critical for production scalability

// In-memory store for rate limiting (development only)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Simple rate limiting middleware for API routes
 * @param config - Rate limit configuration
 * @returns Middleware function
 */
export function rateLimit(config: RateLimitConfig) {
  return async (request: NextRequest) => {
    const identifier = getIdentifier(request);
    const now = Date.now();
    
    // Clean up expired entries
    cleanupExpiredEntries(now);
    
    const record = rateLimitStore.get(identifier);
    
    if (!record || now > record.resetTime) {
      // New window
      rateLimitStore.set(identifier, {
        count: 1,
        resetTime: now + config.windowMs
      });
      return null; // Allow request
    }
    
    if (record.count >= config.max) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      
      return NextResponse.json(
        { 
          error: config.message || 'Too many requests, please try again later',
          retryAfter 
        },
        { 
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': config.max.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(record.resetTime).toISOString()
          }
        }
      );
    }
    
    // Increment count
    record.count++;
    return null; // Allow request
  };
}

/**
 * Get identifier for rate limiting (IP or API key)
 */
function getIdentifier(request: NextRequest): string {
  // Try to get API key from Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const apiKey = authHeader.substring(7);
    return `api:${apiKey}`;
  }
  
  // Fallback to IP address
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return `ip:${ip}`;
}

/**
 * Clean up expired rate limit entries
 */
function cleanupExpiredEntries(now: number) {
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Rate limit configurations for different endpoints
 */
export const RATE_LIMITS = {
  documentUpload: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50,
    message: 'Too many document uploads. Please wait before uploading more documents.'
  },
  documentSearch: {
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    message: 'Too many search requests. Please slow down.'
  },
  aiDocumentCreation: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100,
    message: 'Too many AI document creation requests. Please wait before creating more AI documents.'
  },
  documentList: {
    windowMs: 60 * 1000, // 1 minute
    max: 200,
    message: 'Too many document list requests. Please slow down.'
  },
  // Clipboard rate limits
  clipboardRead: {
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    message: 'Too many clipboard read requests. Please slow down.'
  },
  clipboardWrite: {
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    message: 'Too many clipboard write requests. Please slow down.'
  },
  clipboardDelete: {
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    message: 'Too many clipboard delete requests. Please slow down.'
  },
  // Model Router rate limits (for PAP agents)
  chatCompletions: {
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    message: 'Too many chat completion requests. Please slow down.'
  }
};