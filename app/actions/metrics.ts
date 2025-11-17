import 'server-only';

import { unstable_cache } from 'next/cache';
import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { FALLBACK_METRICS } from '@/lib/constants/metrics';

interface PlatformMetrics {
  totalUsers: number;
  totalProjects: number;
  totalServers: number;
  newProfiles30d: number; // New profiles created in last 30 days
  newUsers30d: number;
}

/**
 * Query platform metrics from database with caching
 * Cache revalidates every 15 minutes (900 seconds)
 * This is a regular cached function, not a server action
 */
async function queryPlatformMetrics(): Promise<PlatformMetrics> {
    try {
      // Combine all metrics into a single optimized query using CTEs
      const result = await db.execute<{
        total_users: number;
        total_projects: number;
        total_servers: number;
        new_profiles_30d: number;
        new_users_30d: number;
      }>(sql`
        WITH metrics AS (
          SELECT
            (SELECT COUNT(*) FROM users) as total_users,
            (SELECT COUNT(*) FROM projects) as total_projects,
            (SELECT COUNT(*) FROM mcp_servers) as total_servers,
            (SELECT COUNT(*) FROM profiles WHERE created_at >= NOW() - INTERVAL '30 days') as new_profiles_30d,
            (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '30 days') as new_users_30d
        )
        SELECT * FROM metrics
      `);

      const metrics = result.rows[0];

      return {
        totalUsers: Number(metrics?.total_users || 0),
        totalProjects: Number(metrics?.total_projects || 0),
        totalServers: Number(metrics?.total_servers || 0),
        newProfiles30d: Number(metrics?.new_profiles_30d || 0),
        newUsers30d: Number(metrics?.new_users_30d || 0),
      };
  } catch (error) {
    console.error('Error fetching platform metrics:', error);
    // Return fallback values on error - from centralized constants
    return {
      totalUsers: FALLBACK_METRICS.totalUsers,
      totalProjects: FALLBACK_METRICS.totalProjects,
      totalServers: FALLBACK_METRICS.totalServers,
      newProfiles30d: FALLBACK_METRICS.newProfiles30d,
      newUsers30d: FALLBACK_METRICS.newUsers30d,
    };
  }
}

// Export cached version of the function
export const getPlatformMetrics = unstable_cache(
  queryPlatformMetrics,
  ['platform-metrics'], // Cache key
  {
    revalidate: 900, // Revalidate every 15 minutes
    tags: ['metrics'], // Tags for manual invalidation if needed
  }
);
