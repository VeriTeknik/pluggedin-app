import 'server-only';

import { sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

import { db } from '@/db';
import { FALLBACK_METRICS } from '@/lib/constants/metrics';

interface PlatformMetrics {
  totalUsers: number;
  totalProjects: number;
  totalServers: number; // Local user installations
  totalRegistryServers: number; // Total servers available in registry
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
      // Optimized query using CTEs and FILTER clause for maximum parallelization
      // All counts are executed in parallel CTEs, then combined in final SELECT
      // - users: 1 scan (total + new_30d combined with FILTER)
      // - profiles: 1 scan (new_30d with FILTER)
      // - projects: 1 scan (total)
      // - mcp_servers: 1 scan (total)
      // Total: 4 table scans with optimal parallelization
      const result = await db.execute<{
        total_users: number;
        total_projects: number;
        total_servers: number;
        new_profiles_30d: number;
        new_users_30d: number;
      }>(sql`
        WITH
          user_counts AS (
            SELECT
              COUNT(*) as total,
              COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as new_30d
            FROM users
          ),
          profile_counts AS (
            SELECT
              COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as new_30d
            FROM profiles
          ),
          project_counts AS (
            SELECT COUNT(*) as total FROM projects
          ),
          server_counts AS (
            SELECT COUNT(*) as total FROM mcp_servers
          )
        SELECT
          user_counts.total as total_users,
          user_counts.new_30d as new_users_30d,
          profile_counts.new_30d as new_profiles_30d,
          project_counts.total as total_projects,
          server_counts.total as total_servers
        FROM user_counts, profile_counts, project_counts, server_counts
      `);

      const metrics = result.rows[0];

      // Fetch registry server count from registry API
      let { totalRegistryServers } = FALLBACK_METRICS;
      try {
        const registryResponse = await fetch('https://registry.plugged.in/v0/enhanced/servers?limit=1', {
          signal: AbortSignal.timeout(3000), // 3-second timeout
        });
        if (registryResponse.ok) {
          const registryData = await registryResponse.json();
          totalRegistryServers = registryData.total_count || FALLBACK_METRICS.totalRegistryServers;
        }
      } catch (registryError) {
        console.warn('Failed to fetch registry server count, using fallback:', registryError);
        // Use fallback value, already set above
      }

      return {
        totalUsers: Number(metrics?.total_users || 0),
        totalProjects: Number(metrics?.total_projects || 0),
        totalServers: Number(metrics?.total_servers || 0),
        totalRegistryServers,
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
      totalRegistryServers: FALLBACK_METRICS.totalRegistryServers,
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
