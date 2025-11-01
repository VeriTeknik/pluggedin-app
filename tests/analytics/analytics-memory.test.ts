import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let cache: any;
let originalSetInterval: typeof setInterval;
let originalProcess: typeof process;

const importAnalyticsModule = () => import('@/lib/analytics-cache');

const createCacheInstance = async () => {
  const { AnalyticsCache } = await importAnalyticsModule();
  cache = new AnalyticsCache();
  return cache;
};

describe('Analytics Cache Memory Management', () => {
  beforeEach(() => {
    vi.useRealTimers();
    originalSetInterval = global.setInterval;
    originalProcess = global.process;
    cache = null;
    delete (globalThis as any).__analyticsCacheCleanupRegistered;
  });

  afterEach(() => {
    global.setInterval = originalSetInterval;
    global.process = originalProcess;
    if (cache) {
      cache.destroy();
      cache = null;
    }
    vi.useRealTimers();
  });

  describe('Interval Management', () => {
    it('should unref the cleanup interval in Node.js environment', async () => {
      let intervalId: any;
      let unrefCalled = false;

      global.setInterval = vi.fn((callback, delay) => {
        intervalId = originalSetInterval(callback, delay);
        (intervalId as any).unref = vi.fn(() => {
          unrefCalled = true;
          return intervalId;
        });
        return intervalId;
      }) as any;

      await createCacheInstance();

      expect(unrefCalled).toBe(true);
      expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
    });

    it('should handle environments without unref gracefully', async () => {
      global.setInterval = vi.fn((callback, delay) => originalSetInterval(callback, delay)) as any;

      await expect(createCacheInstance()).resolves.toBeDefined();
      expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
    });

    it('should handle environments without setInterval', async () => {
      delete (global as any).setInterval;

      await expect(createCacheInstance()).resolves.toBeDefined();
    });
  });

  describe('Process Event Handler Registration', () => {
    it('should register process handlers only once (singleton pattern)', async () => {
      const exitHandlers: Function[] = [];
      const sigtermHandlers: Function[] = [];
      const sigintHandlers: Function[] = [];

      global.process = {
        ...originalProcess,
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'exit') exitHandlers.push(handler);
          if (event === 'SIGTERM') sigtermHandlers.push(handler);
          if (event === 'SIGINT') sigintHandlers.push(handler);
          return global.process;
        }),
      } as any;

      vi.resetModules();
      const firstModule = await importAnalyticsModule();

      expect(exitHandlers).toHaveLength(1);
      expect(sigtermHandlers).toHaveLength(1);
      expect(sigintHandlers).toHaveLength(1);
      expect(globalThis.__analyticsCacheCleanupRegistered).toBe(true);

      firstModule.analyticsCache.destroy();

      exitHandlers.length = 0;
      sigtermHandlers.length = 0;
      sigintHandlers.length = 0;

      vi.resetModules();
      const secondModule = await importAnalyticsModule();

      expect(exitHandlers).toHaveLength(0);
      expect(sigtermHandlers).toHaveLength(0);
      expect(sigintHandlers).toHaveLength(0);
      expect(globalThis.__analyticsCacheCleanupRegistered).toBe(true);

      secondModule.analyticsCache.destroy();
    });

    it('should not register handlers in non-Node environments', async () => {
      delete (global as any).process;

      vi.resetModules();

      const module = await importAnalyticsModule();
      module.analyticsCache.destroy();
      expect(globalThis.__analyticsCacheCleanupRegistered).toBeUndefined();
    });
  });

  describe('Memory Limits', () => {
    it('should enforce MAX_ENTRIES limit to prevent unbounded growth', async () => {
      const cacheInstance = await createCacheInstance();

      for (let i = 0; i < 1000; i++) {
        cacheInstance.set(`key-${i}`, { data: i });
      }

      let stats = cacheInstance.getStats();
      expect(stats.size).toBe(1000);

      cacheInstance.set('key-1000', { data: 1000 });

      stats = cacheInstance.getStats();
      expect(stats.size).toBe(1000);
      expect(cacheInstance.get('key-0')).toBeNull();
      expect(cacheInstance.get('key-1000')).toEqual({ data: 1000 });
    });

    it('should clean up expired entries periodically', async () => {
      vi.useRealTimers();

      const cacheInstance = await createCacheInstance();
      cacheInstance.set('short-ttl', { data: 'expires soon' }, 100);
      cacheInstance.set('long-ttl', { data: 'expires later' }, 5000);

      expect(cacheInstance.get('short-ttl')).toEqual({ data: 'expires soon' });
      expect(cacheInstance.get('long-ttl')).toEqual({ data: 'expires later' });

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(cacheInstance.get('short-ttl')).toBeNull();
      expect(cacheInstance.get('long-ttl')).toEqual({ data: 'expires later' });
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate all entries for a specific profile', async () => {
      const cacheInstance = await createCacheInstance();

      cacheInstance.set('analytics:overview:user1:profile1:7d', { data: 'profile1 data' });
      cacheInstance.set('analytics:tools:user1:profile1:30d', { data: 'profile1 tools' });
      cacheInstance.set('analytics:overview:user1:profile2:7d', { data: 'profile2 data' });
      cacheInstance.set('other:data', { data: 'unrelated' });

      cacheInstance.invalidateProfile('profile1');

      expect(cacheInstance.get('analytics:overview:user1:profile1:7d')).toBeNull();
      expect(cacheInstance.get('analytics:tools:user1:profile1:30d')).toBeNull();
      expect(cacheInstance.get('analytics:overview:user1:profile2:7d')).toEqual({ data: 'profile2 data' });
      expect(cacheInstance.get('other:data')).toEqual({ data: 'unrelated' });
    });

    it('should clear all cache entries', async () => {
      const cacheInstance = await createCacheInstance();

      cacheInstance.set('key1', { data: 1 });
      cacheInstance.set('key2', { data: 2 });
      cacheInstance.set('key3', { data: 3 });

      expect(cacheInstance.getStats().size).toBe(3);

      cacheInstance.clear();

      expect(cacheInstance.getStats().size).toBe(0);
      expect(cacheInstance.get('key1')).toBeNull();
      expect(cacheInstance.get('key2')).toBeNull();
      expect(cacheInstance.get('key3')).toBeNull();
    });
  });

  describe('Destroy Cleanup', () => {
    it('should clear interval and cache on destroy', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      const cacheInstance = await createCacheInstance();
      cacheInstance.set('test', { data: 'test' });
      expect(cacheInstance.getStats().size).toBe(1);

      cacheInstance.destroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(cacheInstance.getStats().size).toBe(0);
    });
  });
});
