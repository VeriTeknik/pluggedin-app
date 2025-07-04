'use server';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { McpServerSource, profilesTable, searchCacheTable, serverInstallationsTable, serverReviews } from '@/db/schema';
import { registryVPClient } from '@/lib/registry/pluggedin-registry-vp-client';
import { MetricsResponse } from '@/types/reviews';
import { SearchIndex } from '@/types/search';

/**
 * Submit rating to registry
 */
async function submitRatingToRegistry(
  serverId: string,
  rating: number,
  source: McpServerSource
) {
  try {
    const result = await registryVPClient.submitRating(serverId, rating, source);
    return result;
  } catch (error) {
    console.error('Error submitting rating to registry:', error);
    return { success: false };
  }
}

/**
 * Track installation in registry
 */
async function trackInstallationInRegistry(
  serverId: string,
  source: McpServerSource,
  metadata?: {
    userId?: string;
    version?: string;
    platform?: string;
  }
) {
  try {
    const result = await registryVPClient.trackInstallation(serverId, {
      source,
      user_id: metadata?.userId,
      version: metadata?.version,
      platform: metadata?.platform,
      timestamp: Date.now()
    });
    return result;
  } catch (error) {
    console.error('Error tracking installation in registry:', error);
    return { success: false };
  }
}

/**
 * Track a server installation
 */
export const trackServerInstallation = async (input: {
  serverUuid: string;
  externalId: string;
  source: McpServerSource;
  profileUuid: string;
}) => {
  try {
    // Validate input
    if (!input.serverUuid && (!input.externalId || !input.source)) {
      return { 
        success: false, 
        error: 'Either server UUID or external ID with source must be provided' 
      };
    }

    // Check if this installation already exists
    let existingInstallation;
    
    if (input.serverUuid) {
      existingInstallation = await db.query.serverInstallationsTable.findFirst({
        where: and(
          eq(serverInstallationsTable.profile_uuid, input.profileUuid),
          eq(serverInstallationsTable.server_uuid, input.serverUuid)
        ),
      });
    } else if (input.externalId && input.source) {
      existingInstallation = await db.query.serverInstallationsTable.findFirst({
        where: and(
          eq(serverInstallationsTable.profile_uuid, input.profileUuid),
          eq(serverInstallationsTable.external_id, input.externalId),
          eq(serverInstallationsTable.source, input.source)
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

    // Record the installation locally
    await db.insert(serverInstallationsTable).values({
      profile_uuid: input.profileUuid,
      server_uuid: input.serverUuid || undefined,
      external_id: input.externalId || undefined,
      source: input.source || McpServerSource.PLUGGEDIN,
    });

    // Also track in registry if it's a registry or community server
    if (input.externalId && (input.source === McpServerSource.REGISTRY || input.source === McpServerSource.COMMUNITY)) {
      await trackInstallationInRegistry(input.externalId, input.source).catch(error => {
        console.error('Failed to track installation in registry:', error);
        // Don't fail the local tracking if registry tracking fails
      });
    }

    // Create notification for the server owner if it's a shared server
    if (input.source === McpServerSource.COMMUNITY && input.externalId) {
      try {
        // Get the shared server details
        const { sharedMcpServersTable } = await import('@/db/schema');
        const { eq } = await import('drizzle-orm');
        
        const sharedServer = await db.query.sharedMcpServersTable.findFirst({
          where: eq(sharedMcpServersTable.uuid, input.externalId),
          with: {
            profile: {
              with: {
                project: {
                  with: {
                    user: true
                  }
                }
              }
            }
          }
        });
        
        if (sharedServer && sharedServer.profile) {
          // Get the installer's profile for the notification message
          const installerProfile = await db.query.profilesTable.findFirst({
            where: eq(profilesTable.uuid, input.profileUuid),
            with: {
              project: {
                with: {
                  user: true
                }
              }
            }
          });
          
          const installerName = installerProfile?.project?.user?.username || 'Someone';
          
          // Create notification for the server owner
          const { createNotification } = await import('@/app/actions/notifications');
          await createNotification({
            profileUuid: sharedServer.profile_uuid,
            type: 'SYSTEM',
            title: 'Server Installed',
            message: `${installerName} installed your shared server "${sharedServer.title}"`,
            severity: 'SUCCESS',
            link: `/social/servers` // Link to their shared servers page
          });
        }
      } catch (notifError) {
        console.error('Failed to create installation notification:', notifError);
        // Continue even if notification fails
      }
    }

    // Update cache for external servers
    if (input.externalId && input.source) {
      await updateServerInCache({ externalId: input.externalId, source: input.source }).catch(error => {
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

    // Get user ID from profile UUID
    const profileData = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.uuid, profileUuid),
      with: {
        project: {
          columns: {
            user_id: true
          }
        }
      }
    });

    if (!profileData?.project?.user_id) {
      return {
        success: false,
        error: 'Could not find user associated with this profile'
      };
    }

    const userId = profileData.project.user_id;

    // Check if this user already rated this server
    let existingRating;
    
    if (serverUuid) {
      // TODO: Handle serverUuid case for serverReviews
      return {
        success: false,
        error: 'Server UUID based reviews are not supported yet'
      };
    } else if (externalId && source) {
      existingRating = await db.query.serverReviews.findFirst({
        where: and(
          eq(serverReviews.user_id, userId),
          eq(serverReviews.server_external_id, externalId),
          eq(serverReviews.server_source, source)
        ),
      });
    }

    // If already rated, update the rating
    if (existingRating) {
      if (externalId && source) {
        await db
          .update(serverReviews)
          .set({ 
            rating, 
            comment,
            updated_at: new Date() 
          })
          .where(
            and(
              eq(serverReviews.user_id, userId),
              eq(serverReviews.server_external_id, externalId),
              eq(serverReviews.server_source, source)
            )
          );
      }
      
      // Also submit updated rating to registry if it's a registry or community server
      if (externalId && (source === McpServerSource.REGISTRY || source === McpServerSource.COMMUNITY)) {
        await submitRatingToRegistry(externalId, rating, source).catch(error => {
          console.error('Failed to submit rating to registry:', error);
          // Don't fail the local rating if registry submission fails
        });
      }
      
      // Update cache for external servers
      if (externalId && source) {
        await updateServerInCache({ externalId, source }).catch(error => {
          console.error('Failed to update cache after rating:', error);
          // Don't fail the rating action if cache update fails
        });
      }
      
      return { 
        success: true,
        message: 'Rating updated'
      };
    }

    // Create new rating locally
    await db.insert(serverReviews).values({
      user_id: userId,
      server_external_id: externalId!,
      server_source: source || McpServerSource.PLUGGEDIN,
      rating,
      comment,
    });

    // Also submit to registry if it's a registry or community server
    if (externalId && (source === McpServerSource.REGISTRY || source === McpServerSource.COMMUNITY)) {
      await submitRatingToRegistry(externalId, rating, source).catch(error => {
        console.error('Failed to submit rating to registry:', error);
        // Don't fail the local rating if registry submission fails
      });
    }

    // Update cache for external servers
    if (externalId && source) {
      await updateServerInCache({ externalId, source }).catch(error => {
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
export async function getServerRatingMetrics(params: {
  source: McpServerSource;
  externalId: string;
}): Promise<MetricsResponse> {
  try {
    // Get ratings
    const ratingQuery = db
      .select({
        averageRating: sql<number>`COALESCE(avg(${serverReviews.rating}), 0)`,
        ratingCount: sql<number>`count(${serverReviews.rating})`,
      })
      .from(serverReviews)
      .where(
        and(
          eq(serverReviews.server_external_id, params.externalId),
          eq(serverReviews.server_source, params.source)
        )
      );

    const ratingResults = await ratingQuery;
    const ratingMetrics = ratingResults[0];

    // Get installation count
    const installationQuery = db
      .select({
        installationCount: sql<number>`count(*)`,
      })
      .from(serverInstallationsTable)
      .where(
        and(
          eq(serverInstallationsTable.external_id, params.externalId),
          eq(serverInstallationsTable.source, params.source)
        )
      );

    const installationResults = await installationQuery;
    const installationMetrics = installationResults[0];

    return { 
      success: true,
      metrics: {
        averageRating: ratingMetrics.averageRating,
        ratingCount: ratingMetrics.ratingCount,
        installationCount: installationMetrics.installationCount,
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
        for (const [_key, server] of Object.entries(results)) {
          const typedServer = server as any;
          if (!typedServer.source || !typedServer.external_id) {
            continue;
          }
          
          // Get metrics for this server
          const metricsResult = await getServerRatingMetrics(
            {
              source: typedServer.source,
              externalId: typedServer.external_id
            }
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
export async function updateServerInCache(params: {
  externalId: string;
  source: McpServerSource;
}) {
  try {
    // Get all cache entries
    const cacheEntries = await db.query.searchCacheTable.findMany();
    
    // Get latest metrics for this server
    const metricsResult = await getServerRatingMetrics({
      source: params.source,
      externalId: params.externalId
    });
    
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
        for (const [_key, server] of Object.entries(results)) {
          const typedServer = server as any;
          
          // Only update the specific server
          if (typedServer.external_id === params.externalId && typedServer.source === params.source) {
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
    console.error('Error updating server in cache:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
} 