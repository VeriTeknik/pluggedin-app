import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { ProxyMemoryManager } from '@/lib/proxy-memory-manager';

describe('ProxyMemoryManager', () => {
  let manager: ProxyMemoryManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ProxyMemoryManager({
      cleanupIntervalMs: 1000, // 1 second for testing
      staleEntryThresholdMs: 2000, // 2 seconds for testing
      maxEntries: 3, // Small limit for testing
    });
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  describe('Basic Operations', () => {
    it('should register and track maps', () => {
      const testMap = new Map();
      manager.registerMap('test', testMap);
      
      manager.trackAccess('test', 'key1', { value: 'data1' });
      const result = manager.get('test', 'key1');
      
      expect(result).toEqual({ value: 'data1' });
    });

    it('should update last used time on access', () => {
      const testMap = new Map();
      manager.registerMap('test', testMap);
      
      manager.trackAccess('test', 'key1', { value: 'data1' });
      const firstAccessTime = Date.now();
      
      vi.advanceTimersByTime(500);
      
      manager.get('test', 'key1');
      const secondAccessTime = Date.now();
      
      expect(secondAccessTime).toBeGreaterThan(firstAccessTime);
    });

    it('should remove entries', () => {
      const testMap = new Map();
      manager.registerMap('test', testMap);
      
      manager.trackAccess('test', 'key1', { value: 'data1' });
      expect(manager.get('test', 'key1')).toEqual({ value: 'data1' });
      
      manager.remove('test', 'key1');
      expect(manager.get('test', 'key1')).toBeUndefined();
    });

    it('should clear specific maps', () => {
      const testMap = new Map();
      manager.registerMap('test', testMap);
      
      manager.trackAccess('test', 'key1', { value: 'data1' });
      manager.trackAccess('test', 'key2', { value: 'data2' });
      
      manager.clearMap('test');
      
      expect(manager.get('test', 'key1')).toBeUndefined();
      expect(manager.get('test', 'key2')).toBeUndefined();
    });
  });

  describe('Automatic Cleanup', () => {
    it('should remove stale entries after threshold', () => {
      const testMap = new Map();
      manager.registerMap('test', testMap);
      
      // Add entries
      manager.trackAccess('test', 'old', { value: 'old-data' });
      
      // Advance time past stale threshold
      vi.advanceTimersByTime(3000); // Past 2 second threshold
      
      // Add a new entry
      manager.trackAccess('test', 'new', { value: 'new-data' });
      
      // Trigger cleanup
      vi.advanceTimersByTime(1000);
      
      // Old entry should be removed, new entry should remain
      expect(manager.get('test', 'old')).toBeUndefined();
      expect(manager.get('test', 'new')).toEqual({ value: 'new-data' });
    });
  });

  describe('Memory Management', () => {
    it('should trim map when exceeding max entries', () => {
      const testMap = new Map();
      manager.registerMap('test', testMap);
      
      // Add entries up to max
      manager.trackAccess('test', 'key1', { value: 'data1' });
      vi.advanceTimersByTime(100);
      manager.trackAccess('test', 'key2', { value: 'data2' });
      vi.advanceTimersByTime(100);
      manager.trackAccess('test', 'key3', { value: 'data3' });
      vi.advanceTimersByTime(100);
      
      // Add one more to trigger trimming
      manager.trackAccess('test', 'key4', { value: 'data4' });
      
      // Should keep most recent entries (80% of max = 2.4, rounded to 2)
      const stats = manager.getStats();
      expect(stats.maps[0].size).toBeLessThanOrEqual(3);
    });

    it('should provide accurate statistics', () => {
      const testMap1 = new Map();
      const testMap2 = new Map();
      
      manager.registerMap('map1', testMap1);
      manager.registerMap('map2', testMap2);
      
      manager.trackAccess('map1', 'key1', { value: 'data1' });
      manager.trackAccess('map1', 'key2', { value: 'data2' });
      manager.trackAccess('map2', 'key1', { value: 'data3' });
      
      const stats = manager.getStats();
      
      expect(stats.maps).toHaveLength(2);
      expect(stats.totalEntries).toBe(3);
      expect(stats.maps.find(m => m.name === 'map1')?.size).toBe(2);
      expect(stats.maps.find(m => m.name === 'map2')?.size).toBe(1);
    });
  });

  describe('Cleanup Lifecycle', () => {
    it('should clean up resources on destroy', () => {
      const testMap = new Map();
      manager.registerMap('test', testMap);
      
      manager.trackAccess('test', 'key1', { value: 'data1' });
      
      manager.destroy();
      
      const stats = manager.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.maps).toHaveLength(0);
    });
  });
});