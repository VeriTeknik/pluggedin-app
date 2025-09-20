import { LRUCache } from 'lru-cache';

import { debugError,debugLog } from './debug-log';

interface MemoryManagerConfig {
  staleEntryThresholdMs?: number;
  maxEntries?: number;
}

export class ProxyMemoryManager {
  private caches = new Map<string, LRUCache<string, any>>();
  private config: Required<MemoryManagerConfig>;

  constructor(config: MemoryManagerConfig = {}) {
    this.config = {
      staleEntryThresholdMs: config.staleEntryThresholdMs ?? 1800000, // 30 minutes
      maxEntries: config.maxEntries ?? 5000,
    };
  }

  /**
   * Register a named cache
   */
  registerMap(name: string) {
    if (this.caches.has(name)) return;
    
    const cache = new LRUCache<string, any>({
      max: this.config.maxEntries,
      ttl: this.config.staleEntryThresholdMs,
      updateAgeOnGet: true,
      dispose: (key: any, value: any) => {
        debugLog(`[ProxyMemoryManager] Evicted ${key} from ${name}`);
      },
    });
    
    this.caches.set(name, cache);
    debugLog(`[ProxyMemoryManager] Registered map: ${name}`);
  }

  /**
   * Track access to an entry
   */
  trackAccess(mapName: string, key: string, data: any): void {
    const cache = this.caches.get(mapName);
    if (!cache) {
      debugError(`[ProxyMemoryManager] Map not registered: ${mapName}`);
      return;
    }
    cache.set(key, data);
  }

  /**
   * Get an entry
   */
  get(mapName: string, key: string): any {
    return this.caches.get(mapName)?.get(key);
  }

  /**
   * Remove an entry
   */
  remove(mapName: string, key: string): boolean {
    return this.caches.get(mapName)?.delete(key) ?? false;
  }

  /**
   * Clear all entries in a specific map
   */
  clearMap(mapName: string): void {
    this.caches.get(mapName)?.clear();
    debugLog(`[ProxyMemoryManager] Cleared map: ${mapName}`);
  }

  /**
   * Clear all managed maps
   */
  clearAll(): void {
    for (const [name, cache] of this.caches.entries()) {
      cache.clear();
      debugLog(`[ProxyMemoryManager] Cleared map: ${name}`);
    }
  }

  /**
   * Get memory usage statistics
   */
  getStats(): {
    maps: { name: string; size: number }[];
    totalEntries: number;
    estimatedMemoryBytes: number;
    config: Required<MemoryManagerConfig>;
  } {
    const maps = Array.from(this.caches.entries()).map(([name, cache]) => ({
      name,
      size: cache.size,
    }));
    
    const totalEntries = maps.reduce((sum, m) => sum + m.size, 0);
    
    return {
      maps,
      totalEntries,
      estimatedMemoryBytes: totalEntries * 1024, // Rough estimate: 1KB per entry
      config: this.config,
    };
  }

  /**
   * Destroy the memory manager and clean up resources
   */
  destroy(): void {
    this.clearAll();
    this.caches.clear();
    debugLog('[ProxyMemoryManager] Destroyed');
  }
}

// Use WeakMap for better memory management in SSR/testing environments
const managerInstances = new WeakMap<object, ProxyMemoryManager>();
const MANAGER_KEY = Symbol.for('proxy.memory.manager');

/**
 * Get or create a ProxyMemoryManager instance
 * Uses WeakMap to allow garbage collection when context is destroyed
 */
export function getProxyMemoryManager(context: object = globalThis): ProxyMemoryManager {
  let manager = managerInstances.get(context);
  
  if (!manager) {
    manager = new ProxyMemoryManager({
      staleEntryThresholdMs: 1800000, // 30 minutes
      maxEntries: 5000, // Per cache limit
    });
    managerInstances.set(context, manager);
  }
  
  return manager;
}

/**
 * Destroy a ProxyMemoryManager instance for a given context
 */
export function destroyProxyMemoryManager(context: object = globalThis): void {
  const manager = managerInstances.get(context);
  if (manager) {
    manager.destroy();
    managerInstances.delete(context);
  }
}

/**
 * Clean up all manager instances (useful for testing)
 */
export function destroyAllProxyMemoryManagers(): void {
  // Note: WeakMap doesn't provide iteration, so we can't clean all instances
  // This is actually good for memory management as they'll be GC'd automatically
  // For testing, pass the test context explicitly to destroy
  destroyProxyMemoryManager(globalThis);
}