import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AnalyticsCache } from '@/lib/analytics-cache';

describe('Analytics Cache Memory Management', () => {
  let cache: AnalyticsCache;
  let originalSetInterval: typeof setInterval;
  let originalProcess: typeof process;

  beforeEach(() => {
    // Store originals
    originalSetInterval = global.setInterval;
    originalProcess = global.process;

    // Reset global state
    delete (globalThis as any).__analyticsCacheCleanupRegistered;
  });

  afterEach(() => {
    // Restore originals
    global.setInterval = originalSetInterval;
    global.process = originalProcess;

    // Cleanup
    if (cache) {
      cache.destroy();
    }
  });

  describe('Interval Management', () => {
    it('should unref the cleanup interval in Node.js environment', () => {
      let intervalId: any;
      let unrefCalled = false;

      // Mock setInterval to return an object with unref
      global.setInterval = vi.fn((callback, delay) => {
        intervalId = originalSetInterval(callback, delay);
        // Add unref method to track if it's called
        (intervalId as any).unref = vi.fn(() => {
          unrefCalled = true;
          return intervalId;
        });
        return intervalId;
      }) as any;

      // Create cache instance
      cache = new (require('@/lib/analytics-cache').AnalyticsCache)();

      // Verify unref was called
      expect(unrefCalled).toBe(true);
      expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
    });

    it('should handle environments without unref gracefully', () => {
      // Mock setInterval to return an object without unref (browser-like)
      global.setInterval = vi.fn((callback, delay) => {
        const id = originalSetInterval(callback, delay);
        return id;  // No unref method
      }) as any;

      // Should not throw
      expect(() => {
        cache = new (require('@/lib/analytics-cache').AnalyticsCache)();
      }).not.toThrow();

      expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
    });

    it('should handle environments without setInterval', () => {
      // Remove setInterval (edge case)
      delete (global as any).setInterval;

      // Should not throw
      expect(() => {
        cache = new (require('@/lib/analytics-cache').AnalyticsCache)();
      }).not.toThrow();
    });
  });

  describe('Process Event Handler Registration', () => {
    it('should register process handlers only once (singleton pattern)', () => {
      const exitHandlers: Function[] = [];
      const sigtermHandlers: Function[] = [];
      const sigintHandlers: Function[] = [];

      // Mock process.on to track handler registration
      global.process = {
        ...originalProcess,
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'exit') exitHandlers.push(handler);
          if (event === 'SIGTERM') sigtermHandlers.push(handler);
          if (event === 'SIGINT') sigintHandlers.push(handler);
          return global.process;
        }),
      } as any;

      // Clear module cache to force re-execution
      delete require.cache[require.resolve('@/lib/analytics-cache')];

      // First import - should register handlers
      require('@/lib/analytics-cache');

      expect(exitHandlers).toHaveLength(1);
      expect(sigtermHandlers).toHaveLength(1);
      expect(sigintHandlers).toHaveLength(1);
      expect((globalThis as any).__analyticsCacheCleanupRegistered).toBe(true);

      // Clear handlers arrays
      exitHandlers.length = 0;
      sigtermHandlers.length = 0;
      sigintHandlers.length = 0;

      // Second import - should NOT register handlers again
      delete require.cache[require.resolve('@/lib/analytics-cache')];
      require('@/lib/analytics-cache');

      expect(exitHandlers).toHaveLength(0);  // No new handlers
      expect(sigtermHandlers).toHaveLength(0);
      expect(sigintHandlers).toHaveLength(0);
      expect((globalThis as any).__analyticsCacheCleanupRegistered).toBe(true);
    });

    it('should not register handlers in non-Node environments', () => {
      // Remove process
      delete (global as any).process;

      // Clear module cache
      delete require.cache[require.resolve('@/lib/analytics-cache')];

      // Should not throw
      expect(() => {
        require('@/lib/analytics-cache');
      }).not.toThrow();

      expect((globalThis as any).__analyticsCacheCleanupRegistered).toBeUndefined();
    });
  });

  describe('Memory Limits', () => {
    it('should enforce MAX_ENTRIES limit to prevent unbounded growth', () => {
      cache = new (require('@/lib/analytics-cache').AnalyticsCache)();

      // Add entries up to the limit (1000)
      for (let i = 0; i < 1000; i++) {
        cache.set(`key-${i}`, { data: i });
      }

      // Check stats
      let stats = cache.getStats();
      expect(stats.size).toBe(1000);

      // Add one more - should evict the oldest
      cache.set('key-1000', { data: 1000 });

      stats = cache.getStats();
      expect(stats.size).toBe(1000);  // Still 1000, not 1001

      // The first key should have been evicted
      expect(cache.get('key-0')).toBeNull();
      // The newest key should exist
      expect(cache.get('key-1000')).toEqual({ data: 1000 });
    });

    it('should clean up expired entries periodically', (done) => {
      // Use real timers for this test
      vi.useRealTimers();

      cache = new (require('@/lib/analytics-cache').AnalyticsCache)();

      // Add entries with short TTL
      cache.set('short-ttl', { data: 'expires soon' }, 100);  // 100ms TTL
      cache.set('long-ttl', { data: 'expires later' }, 5000); // 5s TTL

      // Check both exist initially
      expect(cache.get('short-ttl')).toEqual({ data: 'expires soon' });
      expect(cache.get('long-ttl')).toEqual({ data: 'expires later' });

      // Wait for short TTL to expire
      setTimeout(() => {
        // Short TTL should be gone
        expect(cache.get('short-ttl')).toBeNull();
        // Long TTL should still exist
        expect(cache.get('long-ttl')).toEqual({ data: 'expires later' });

        done();
      }, 150);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate all entries for a specific profile', () => {
      cache = new (require('@/lib/analytics-cache').AnalyticsCache)();

      // Add entries for different profiles
      cache.set('analytics:overview:user1:profile1:7d', { data: 'profile1 data' });
      cache.set('analytics:tools:user1:profile1:30d', { data: 'profile1 tools' });
      cache.set('analytics:overview:user1:profile2:7d', { data: 'profile2 data' });
      cache.set('other:data', { data: 'unrelated' });

      // Invalidate profile1
      cache.invalidateProfile('profile1');

      // Profile1 entries should be gone
      expect(cache.get('analytics:overview:user1:profile1:7d')).toBeNull();
      expect(cache.get('analytics:tools:user1:profile1:30d')).toBeNull();

      // Profile2 and unrelated entries should remain
      expect(cache.get('analytics:overview:user1:profile2:7d')).toEqual({ data: 'profile2 data' });
      expect(cache.get('other:data')).toEqual({ data: 'unrelated' });
    });

    it('should clear all cache entries', () => {
      cache = new (require('@/lib/analytics-cache').AnalyticsCache)();

      // Add some entries
      cache.set('key1', { data: 1 });
      cache.set('key2', { data: 2 });
      cache.set('key3', { data: 3 });

      expect(cache.getStats().size).toBe(3);

      // Clear all
      cache.clear();

      expect(cache.getStats().size).toBe(0);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).toBeNull();
    });
  });

  describe('Destroy Cleanup', () => {
    it('should clear interval and cache on destroy', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      cache = new (require('@/lib/analytics-cache').AnalyticsCache)();

      // Add some data
      cache.set('test', { data: 'test' });
      expect(cache.getStats().size).toBe(1);

      // Destroy
      cache.destroy();

      // Interval should be cleared
      expect(clearIntervalSpy).toHaveBeenCalled();

      // Cache should be empty
      expect(cache.getStats().size).toBe(0);
    });
  });
});