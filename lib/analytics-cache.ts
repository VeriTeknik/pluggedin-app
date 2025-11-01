/**
 * Simple in-memory cache for analytics data
 * Reduces database load for frequently accessed analytics
 *
 * PERFORMANCE OPTIMIZATION:
 * - 5-minute TTL for real-time balance between freshness and performance
 * - Automatic cleanup of expired entries
 * - Memory-efficient with size limits
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class AnalyticsCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_ENTRIES = 1000; // Prevent unbounded growth
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Run cleanup every minute
    // Use unref() to prevent the interval from keeping the process alive in serverless
    if (typeof setInterval !== 'undefined') {
      const interval = setInterval(() => this.cleanup(), 60 * 1000);
      // Only unref in Node.js environment (not browser)
      if (typeof interval.unref === 'function') {
        interval.unref();
      }
      this.cleanupInterval = interval;
    }
  }

  /**
   * Get cached data if available and not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Set cache entry with optional TTL
   */
  set<T>(key: string, data: T, ttl?: number): void {
    // Enforce size limit by removing oldest entries if needed
    if (this.cache.size >= this.MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.DEFAULT_TTL,
    });
  }

  /**
   * Clear specific cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries for a specific profile
   */
  invalidateProfile(profileUuid: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(profileUuid)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_ENTRIES,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Cleanup on process exit
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// Create singleton instance
export const analyticsCache = new AnalyticsCache();

// Declare global type for TypeScript
declare global {
   
  var __analyticsCacheCleanupRegistered: boolean | undefined;
}

// Register cleanup handlers only once using singleton pattern
// This prevents memory leaks from multiple handler registrations in hot reload
if (typeof process !== 'undefined' && !globalThis.__analyticsCacheCleanupRegistered) {
  const cleanup = () => analyticsCache.destroy();

  process.on('exit', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);

  // Mark as registered to prevent duplicate registrations
  globalThis.__analyticsCacheCleanupRegistered = true;
}

/**
 * Cache key generator for consistent key formatting
 * SECURITY: Includes userId to ensure tenant isolation - prevents cross-user data leaks
 */
export function getCacheKey(
  type: string,
  userId: string,  // Required for security - ensures cache isolation per user
  profileUuid: string,
  period: string,
  ...extras: string[]
): string {
  const parts = ['analytics', type, userId, profileUuid, period, ...extras];
  return parts.filter(part => part !== undefined && part !== null).join(':');
}
