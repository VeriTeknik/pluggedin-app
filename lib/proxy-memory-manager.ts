import { debugLog, debugError } from './debug-log';

interface TrackedEntry {
  lastUsed: number;
  data: any;
}

interface MemoryManagerConfig {
  cleanupIntervalMs?: number;
  staleEntryThresholdMs?: number;
  maxEntries?: number;
}

export class ProxyMemoryManager {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly trackedMaps: Map<string, Map<string, TrackedEntry>> = new Map();
  private readonly config: Required<MemoryManagerConfig>;
  private memoryUsage: number = 0;

  constructor(config: MemoryManagerConfig = {}) {
    this.config = {
      cleanupIntervalMs: config.cleanupIntervalMs ?? 300000, // 5 minutes
      staleEntryThresholdMs: config.staleEntryThresholdMs ?? 1800000, // 30 minutes
      maxEntries: config.maxEntries ?? 10000, // Maximum entries per map
    };

    this.startCleanupInterval();
  }

  /**
   * Register a map to be managed
   */
  registerMap(name: string, map: Map<string, TrackedEntry>) {
    this.trackedMaps.set(name, map);
    debugLog(`[ProxyMemoryManager] Registered map: ${name}`);
  }

  /**
   * Track access to an entry
   */
  trackAccess(mapName: string, key: string, data: any): void {
    const map = this.trackedMaps.get(mapName);
    if (!map) {
      debugError(`[ProxyMemoryManager] Map not registered: ${mapName}`);
      return;
    }

    map.set(key, {
      lastUsed: Date.now(),
      data,
    });

    // Check if we need to trim the map
    if (map.size > this.config.maxEntries) {
      this.trimMap(mapName, map);
    }
  }

  /**
   * Get an entry and update its last used time
   */
  get(mapName: string, key: string): any {
    const map = this.trackedMaps.get(mapName);
    if (!map) {
      return undefined;
    }

    const entry = map.get(key);
    if (entry) {
      entry.lastUsed = Date.now();
      return entry.data;
    }

    return undefined;
  }

  /**
   * Remove an entry
   */
  remove(mapName: string, key: string): boolean {
    const map = this.trackedMaps.get(mapName);
    if (!map) {
      return false;
    }

    return map.delete(key);
  }

  /**
   * Clear all entries in a specific map
   */
  clearMap(mapName: string): void {
    const map = this.trackedMaps.get(mapName);
    if (map) {
      map.clear();
      debugLog(`[ProxyMemoryManager] Cleared map: ${mapName}`);
    }
  }

  /**
   * Clear all managed maps
   */
  clearAll(): void {
    this.trackedMaps.forEach((map, name) => {
      map.clear();
      debugLog(`[ProxyMemoryManager] Cleared map: ${name}`);
    });
  }

  /**
   * Perform cleanup of stale entries
   */
  private performCleanup(): void {
    const now = Date.now();
    const cutoff = now - this.config.staleEntryThresholdMs;
    let totalRemoved = 0;

    this.trackedMaps.forEach((map, mapName) => {
      const initialSize = map.size;
      const entriesToRemove: string[] = [];

      map.forEach((entry, key) => {
        if (entry.lastUsed < cutoff) {
          entriesToRemove.push(key);
        }
      });

      entriesToRemove.forEach(key => map.delete(key));
      
      const removed = initialSize - map.size;
      if (removed > 0) {
        totalRemoved += removed;
        debugLog(`[ProxyMemoryManager] Removed ${removed} stale entries from ${mapName}`);
      }
    });

    if (totalRemoved > 0) {
      debugLog(`[ProxyMemoryManager] Total cleanup: removed ${totalRemoved} stale entries`);
    }

    this.updateMemoryUsage();
  }

  /**
   * Trim a map to keep only the most recently used entries
   */
  private trimMap(mapName: string, map: Map<string, TrackedEntry>): void {
    const entriesToKeep = Math.floor(this.config.maxEntries * 0.8); // Keep 80% of max
    
    if (map.size <= entriesToKeep) {
      return;
    }

    // Sort entries by last used time
    const sortedEntries = Array.from(map.entries()).sort(
      (a, b) => b[1].lastUsed - a[1].lastUsed
    );

    // Keep only the most recent entries
    map.clear();
    sortedEntries.slice(0, entriesToKeep).forEach(([key, entry]) => {
      map.set(key, entry);
    });

    debugLog(
      `[ProxyMemoryManager] Trimmed ${mapName}: kept ${entriesToKeep} of ${sortedEntries.length} entries`
    );
  }

  /**
   * Start the cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      try {
        this.performCleanup();
      } catch (error) {
        debugError('[ProxyMemoryManager] Cleanup error:', error);
      }
    }, this.config.cleanupIntervalMs);

    debugLog(
      `[ProxyMemoryManager] Started cleanup interval (every ${this.config.cleanupIntervalMs}ms)`
    );
  }

  /**
   * Stop the cleanup interval
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      debugLog('[ProxyMemoryManager] Stopped cleanup interval');
    }
  }

  /**
   * Update memory usage estimate
   */
  private updateMemoryUsage(): void {
    let totalEntries = 0;
    this.trackedMaps.forEach(map => {
      totalEntries += map.size;
    });

    // Rough estimate: 1KB per entry average
    this.memoryUsage = totalEntries * 1024;
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
    const maps = Array.from(this.trackedMaps.entries()).map(([name, map]) => ({
      name,
      size: map.size,
    }));

    const totalEntries = maps.reduce((sum, map) => sum + map.size, 0);

    return {
      maps,
      totalEntries,
      estimatedMemoryBytes: this.memoryUsage,
      config: this.config,
    };
  }

  /**
   * Destroy the memory manager and clean up resources
   */
  destroy(): void {
    this.stopCleanupInterval();
    this.clearAll();
    this.trackedMaps.clear();
    debugLog('[ProxyMemoryManager] Destroyed');
  }
}

// Singleton instance for the MCP proxy
let proxyMemoryManager: ProxyMemoryManager | null = null;

export function getProxyMemoryManager(): ProxyMemoryManager {
  if (!proxyMemoryManager) {
    proxyMemoryManager = new ProxyMemoryManager({
      cleanupIntervalMs: 300000, // 5 minutes
      staleEntryThresholdMs: 1800000, // 30 minutes
      maxEntries: 5000, // Per map limit
    });
  }
  return proxyMemoryManager;
}

export function destroyProxyMemoryManager(): void {
  if (proxyMemoryManager) {
    proxyMemoryManager.destroy();
    proxyMemoryManager = null;
  }
}