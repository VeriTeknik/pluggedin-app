'use server';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { 
  McpServerSource, 
  searchCacheTable,
  serverInstallationsTable, 
  serverRatingsTable
} from '@/db/schema';
import { McpIndex, SearchIndex } from '@/types/search';

/**
 * Track a server installation
 */
export async function trackServerInstallation(
  profileUuid: string,
  serverUuid?: string | null,
  externalId?: string | null,
  source?: McpServerSource
) {
  try {
    // Validate input
    if (!serverUuid && (!externalId || !source)) {
      return { 
        success: false, 
        error: 'Either server UUID or external ID with source must be provided' 
      };
    }

    // Check if this installation already exists
    let existingInstallation;
    
    if (serverUuid) {
      existingInstallation = await db.query.serverInstallationsTable.findFirst({
        where: and(
          eq(serverInstallationsTable.profile_uuid, profileUuid),
          eq(serverInstallationsTable.server_uuid, serverUuid)
        ),
      });
    } else if (externalId && source) {
      existingInstallation = await db.query.serverInstallationsTable.findFirst({
        where: and(
          eq(serverInstallationsTable.profile_uuid, profileUuid),
          eq(serverInstallationsTable.external_id, externalId),
          eq(serverInstallationsTable.source, source)
        ),
      });
    }

    // If already installed, return success without creating duplicate
    if (existingInstallation) {
      return { 
        success: true,
        message: 'Installation already tracked'
      };
    }

    // Record the installation
    await db.insert(serverInstallationsTable).values({
      profile_uuid: profileUuid,
      server_uuid: serverUuid || undefined,
      external_id: externalId || undefined,
      source: source || McpServerSource.PLUGGEDIN,
    });

    // Update cache for external servers
    if (externalId && source) {
      await updateServerInCache(externalId, source).catch(error => {
        console.error('Failed to update cache after installation:', error);
        // Don't fail the installation tracking if cache update fails
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error tracking server installation:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Rate a server
 */
export async function rateServer(
  profileUuid: string,
  rating: number,
  comment?: string,
  serverUuid?: string,
  externalId?: string,
  source?: McpServerSource
) {
  try {
    // Validate input
    if (!serverUuid && (!externalId || !source)) {
      return { 
        success: false, 
        error: 'Either server UUID or external ID with source must be provided' 
      };
    }
    
    if (rating < 1 || rating > 5) {
      return { 
        success: false, 
        error: 'Rating must be between 1 and 5' 
      };
    }

    // Check if this user already rated this server
    let existingRating;
    
    if (serverUuid) {
      existingRating = await db.query.serverRatingsTable.findFirst({
        where: and(
          eq(serverRatingsTable.profile_uuid, profileUuid),
          eq(serverRatingsTable.server_uuid, serverUuid)
        ),
      });
    } else if (externalId && source) {
      existingRating = await db.query.serverRatingsTable.findFirst({
        where: and(
          eq(serverRatingsTable.profile_uuid, profileUuid),
          eq(serverRatingsTable.external_id, externalId),
          eq(serverRatingsTable.source, source)
        ),
      });
    }

    // If already rated, update the rating
    if (existingRating) {
      if (serverUuid) {
        await db
          .update(serverRatingsTable)
          .set({ 
            rating, 
            comment,
            updated_at: new Date()
          })
          .where(
            and(
              eq(serverRatingsTable.profile_uuid, profileUuid),
              eq(serverRatingsTable.server_uuid, serverUuid)
            )
          );
      } else if (externalId && source) {
        await db
          .update(serverRatingsTable)
          .set({ 
            rating, 
            comment,
            updated_at: new Date() 
          })
          .where(
            and(
              eq(serverRatingsTable.profile_uuid, profileUuid),
              eq(serverRatingsTable.external_id, externalId),
              eq(serverRatingsTable.source, source)
            )
          );
      }
      
      // Update cache for external servers
      if (externalId && source) {
        await updateServerInCache(externalId, source).catch(error => {
          console.error('Failed to update cache after rating:', error);
          // Don't fail the rating action if cache update fails
        });
      }
      
      return { 
        success: true,
        message: 'Rating updated'
      };
    }

    // Create new rating
    await db.insert(serverRatingsTable).values({
      profile_uuid: profileUuid,
      server_uuid: serverUuid,
      external_id: externalId,
      source: source || McpServerSource.PLUGGEDIN,
      rating,
      comment,
    });

    // Update cache for external servers
    if (externalId && source) {
      await updateServerInCache(externalId, source).catch(error => {
        console.error('Failed to update cache after rating:', error);
        // Don't fail the rating action if cache update fails
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error rating server:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Get server rating metrics
 */
export async function getServerRatingMetrics(
  serverUuid?: string,
  externalId?: string,
  source?: McpServerSource
) {
  try {
    // Validate input
    if (!serverUuid && (!externalId || !source)) {
      return { 
        success: false, 
        error: 'Either server UUID or external ID with source must be provided' 
      };
    }

    // Get ratings
    let ratingQuery;
    
    if (serverUuid) {
      ratingQuery = db
        .select({
          averageRating: sql<number>`avg(${serverRatingsTable.rating})`,
          ratingCount: sql<number>`count(${serverRatingsTable.rating})`,
        })
        .from(serverRatingsTable)
        .where(eq(serverRatingsTable.server_uuid, serverUuid));
    } else if (externalId && source) {
      ratingQuery = db
        .select({
          averageRating: sql<number>`avg(${serverRatingsTable.rating})`,
          ratingCount: sql<number>`count(${serverRatingsTable.rating})`,
        })
        .from(serverRatingsTable)
        .where(
          and(
            eq(serverRatingsTable.external_id, externalId),
            eq(serverRatingsTable.source, source)
          )
        );
    } else {
      return {
        success: false,
        error: 'Invalid parameters',
      };
    }

    const ratingResults = await ratingQuery;
    const ratingMetrics = ratingResults[0];

    // Get installation count
    let installationQuery;
    
    if (serverUuid) {
      installationQuery = db
        .select({
          installationCount: sql<number>`count(*)`,
        })
        .from(serverInstallationsTable)
        .where(eq(serverInstallationsTable.server_uuid, serverUuid));
    } else if (externalId && source) {
      installationQuery = db
        .select({
          installationCount: sql<number>`count(*)`,
        })
        .from(serverInstallationsTable)
        .where(
          and(
            eq(serverInstallationsTable.external_id, externalId),
            eq(serverInstallationsTable.source, source)
          )
        );
    } else {
      return {
        success: false,
        error: 'Invalid parameters',
      };
    }

    const installationResults = await installationQuery;
    const installationMetrics = installationResults[0];

    return { 
      success: true,
      metrics: {
        averageRating: ratingMetrics.averageRating || 0,
        ratingCount: ratingMetrics.ratingCount || 0,
        installationCount: installationMetrics.installationCount || 0,
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

/**
 * Update all search cache entries with the latest metrics
 * Call this periodically to keep metrics updated
 */
export async function updateSearchCacheMetrics() {
  try {
    // Get all cache entries
    const cacheEntries = await db.query.searchCacheTable.findMany();
    
    for (const entry of cacheEntries) {
      try {
        // Get results from cache
        const results = entry.results as SearchIndex;
        let updated = false;
        
        // Update metrics for each server in the results
        for (const [key, server] of Object.entries(results)) {
          const typedServer = server as any;
          if (!typedServer.source || !typedServer.external_id) continue;
          
          // Get metrics for this server
          const metricsResult = await getServerRatingMetrics(
            undefined,
            typedServer.external_id,
            typedServer.source
          );
          
          if (metricsResult.success && metricsResult.metrics) {
            // Update metrics
            typedServer.rating = metricsResult.metrics.averageRating;
            typedServer.rating_count = metricsResult.metrics.ratingCount;
            typedServer.installation_count = metricsResult.metrics.installationCount;
            updated = true;
          }
        }
        
        // If any metrics were updated, update the cache entry
        if (updated) {
          await db
            .update(searchCacheTable)
            .set({ results })
            .where(eq(searchCacheTable.uuid, entry.uuid));
        }
      } catch (error) {
        console.error(`Error updating metrics for cache entry ${entry.uuid}:`, error);
        // Continue with next entry even if one fails
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error updating search cache metrics:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Update cached search results for a specific server after a rating or installation action
 */
export async function updateServerInCache(
  externalId: string, 
  source: McpServerSource
) {
  try {
    // Get all cache entries
    const cacheEntries = await db.query.searchCacheTable.findMany();
    
    // Get latest metrics for this server
    const metricsResult = await getServerRatingMetrics(
      undefined,
      externalId,
      source
    );
    
    if (!metricsResult.success || !metricsResult.metrics) {
      return { success: false, error: 'Failed to get updated metrics' };
    }
    
    const { averageRating, ratingCount, installationCount } = metricsResult.metrics;
    
    // Update server in all cache entries
    for (const entry of cacheEntries) {
      try {
        // Get results from cache
        const results = entry.results as SearchIndex;
        let updated = false;
        
        // Find and update the specific server in the results
        for (const [key, server] of Object.entries(results)) {
          const typedServer = server as any;
          
          // Only update the specific server
          if (typedServer.external_id === externalId && typedServer.source === source) {
            // Update metrics
            typedServer.rating = averageRating;
            typedServer.rating_count = ratingCount;
            typedServer.installation_count = installationCount;
            updated = true;
            break; // Found and updated the server, no need to check more
          }
        }
        
        // If server was found and updated, update the cache entry
        if (updated) {
          await db
            .update(searchCacheTable)
            .set({ results })
            .where(eq(searchCacheTable.uuid, entry.uuid));
        }
      } catch (error) {
        console.error(`Error updating server in cache entry ${entry.uuid}:`, error);
        // Continue with next entry even if one fails
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error updating server in search cache:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
} 