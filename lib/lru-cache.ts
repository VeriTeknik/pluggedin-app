/**
 * LRU (Least Recently Used) Cache implementation
 * Efficiently manages cache entries with automatic eviction of least recently used items
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
  lastAccessed: number;
}

export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private accessOrder: Map<string, number>;
  private readonly maxSize: number;
  private readonly ttl: number;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly cleanupInterval = 60000; // 1 minute

  constructor(maxSize: number = 1000, ttlMs: number = 60000) {
    this.cache = new Map();
    this.accessOrder = new Map();
    this.maxSize = maxSize;
    this.ttl = ttlMs;

    // Start periodic cleanup of expired entries
    this.startPeriodicCleanup();
  }

  /**
   * Get an item from the cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();

    // Check if expired
    if (entry.expiry <= now) {
      this.delete(key);
      return null;
    }

    // Update access time (mark as recently used)
    entry.lastAccessed = now;
    this.accessOrder.set(key, now);

    return entry.data;
  }

  /**
   * Set an item in the cache
   */
  set(key: string, data: T, ttlOverride?: number): void {
    const now = Date.now();
    const expiry = now + (ttlOverride ?? this.ttl);

    // If cache is at max capacity, evict LRU items
    if (!this.cache.has(key) && this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data,
      expiry,
      lastAccessed: now,
    });
    this.accessOrder.set(key, now);
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (entry.expiry <= Date.now()) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete an item from the cache
   */
  delete(key: string): boolean {
    this.accessOrder.delete(key);
    return this.cache.delete(key);
  }

  /**
   * Clear all items from the cache
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
  }

  /**
   * Get the current size of the cache
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Evict the least recently used item(s)
   */
  private evictLRU(count: number = 1): void {
    // Sort entries by last accessed time
    const sortedEntries = Array.from(this.accessOrder.entries())
      .sort((a, b) => a[1] - b[1]);

    // Remove the least recently used items
    for (let i = 0; i < Math.min(count, sortedEntries.length); i++) {
      const [key] = sortedEntries[i];
      this.delete(key);
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry <= now) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.delete(key));
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startPeriodicCleanup(): void {
    // Clear any existing timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Set up periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.cleanupInterval);

    // Ensure the timer doesn't prevent the process from exiting
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop the periodic cleanup (useful for testing or shutdown)
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    evictionCount: number;
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // Can be extended to track hits/misses
      evictionCount: 0, // Can be extended to track evictions
    };
  }
}

/**
 * Factory function to create a typed LRU cache
 */
export function createLRUCache<T>(maxSize?: number, ttlMs?: number): LRUCache<T> {
  return new LRUCache<T>(maxSize, ttlMs);
}