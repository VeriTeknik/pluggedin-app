import type { McpServerSource } from '@/db/schema';
import { MetricsResponse } from '@/types/reviews';
import { registryVPClient } from '@/lib/registry/pluggedin-registry-vp-client';
import { analyticsAPIClient } from '@/lib/analytics/analytics-api-client';

export async function getServerRatingMetrics(
  source: McpServerSource,
  externalId: string,
  page = 1, // Keep pagination params if needed for reviews
  limit = 10
): Promise<MetricsResponse> {
  try {
    // For registry/community servers, get stats from registry
    if (source === 'REGISTRY' || source === 'COMMUNITY') {
      const stats = await registryVPClient.getServerStats(externalId);
      
      if (stats) {
        return {
          success: true,
          metrics: {
            averageRating: stats.rating || 0,
            ratingCount: stats.rating_count || 0,
            installationCount: stats.installation_count || 0,
          }
        };
      }
    }
    
    // For PluggedIn servers, get from analytics API
    const serverStats = await analyticsAPIClient.getServerStats(externalId);
    
    if (serverStats) {
      return {
        success: true,
        metrics: {
          averageRating: serverStats.average_rating || 0,
          ratingCount: serverStats.rating_count || 0,
          installationCount: serverStats.total_installs || 0,
        }
      };
    }

    // If no stats found, return zeros
    return { 
      success: true,
      metrics: {
        averageRating: 0,
        ratingCount: 0,
        installationCount: 0,
      }
    };
  } catch (error) {
    console.error('Error getting server rating metrics:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}