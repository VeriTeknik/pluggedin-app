import { NextResponse } from 'next/server';

import { getPlatformMetrics } from '@/app/actions/metrics';
import { FALLBACK_METRICS } from '@/lib/constants/metrics';

// Enable ISR caching with 15-minute revalidation
// Note: Removed 'force-dynamic' to allow unstable_cache to work properly
export const revalidate = 900; // Cache for 15 minutes

/**
 * Cache stampeding protection: Prevent multiple concurrent requests from hitting the database
 * When cache expires, only the first request fetches from DB, others wait for that result
 */
class RequestCoalescer<T> {
  private pendingRequests = new Map<string, Promise<T>>();

  async deduplicate(key: string, fn: () => Promise<T>): Promise<T> {
    // Check if there's already a pending request for this key
    const pending = this.pendingRequests.get(key);
    if (pending) {
      return pending;
    }

    // Create a new request
    const promise = fn()
      .finally(() => {
        // Clean up after completion (success or error)
        this.pendingRequests.delete(key);
      });

    this.pendingRequests.set(key, promise);
    return promise;
  }
}

// Singleton instance for metrics requests
const metricsCoalescer = new RequestCoalescer<Awaited<ReturnType<typeof getPlatformMetrics>>>();

export async function GET() {
  try {
    // Use request coalescing to prevent cache stampeding
    // All concurrent requests will share the same database query
    const metrics = await metricsCoalescer.deduplicate('platform-metrics', async () => {
      return await getPlatformMetrics();
    });

    return NextResponse.json(metrics, {
      headers: {
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
      },
    });
  } catch (error) {
    console.error('Error fetching platform metrics:', error);

    // Return fallback values from centralized constants
    return NextResponse.json({
      totalUsers: FALLBACK_METRICS.totalUsers,
      totalProjects: FALLBACK_METRICS.totalProjects,
      totalServers: FALLBACK_METRICS.totalServers,
      newProfiles30d: FALLBACK_METRICS.newProfiles30d,
      newUsers30d: FALLBACK_METRICS.newUsers30d,
    });
  }
}
