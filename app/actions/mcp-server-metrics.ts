'use server';

import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { McpServerSource, profilesTable, serverInstallationsTable } from '@/db/schema';
import { registryVPClient } from '@/lib/registry/pluggedin-registry-vp-client';
import { MetricsResponse } from '@/types/reviews';

/**
 * Submit rating to registry
 */
async function submitRatingToRegistry(
  serverId: string,
  rating: number,
  source: McpServerSource,
  userId?: string,
  comment?: string
) {
  try {
    console.log('[MCP Server Metrics] Submitting rating to registry:', {
      serverId,
      rating,
      source,
      userId,
      comment
    });
    const result = await registryVPClient.submitRating(serverId, rating, source, userId, comment);
    console.log('[MCP Server Metrics] Registry rating result:', result);
    return result;
  } catch (error) {
    console.error('[MCP Server Metrics] Error submitting rating to registry:', error);
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

    // Get user ID for analytics tracking
    const profileData = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.uuid, input.profileUuid),
      with: {
        project: {
          columns: {
            user_id: true
          }
        }
      }
    });

    const userId = profileData?.project?.user_id || 'anonymous';

    // Record the installation locally
    await db.insert(serverInstallationsTable).values({
      profile_uuid: input.profileUuid,
      server_uuid: input.serverUuid || undefined,
      external_id: input.externalId || undefined,
      source: input.source || McpServerSource.PLUGGEDIN,
    });

    // TODO: Track installation to new analytics service when available

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

    // For registry/community servers, submit directly to registry
    if (externalId && (source === McpServerSource.REGISTRY || source === McpServerSource.COMMUNITY)) {
      // Submit rating to registry VP endpoint
      console.log('[rateServer] Submitting rating for:', {
        externalId,
        rating,
        source,
        userId,
        comment
      });
      
      const ratingResult = await submitRatingToRegistry(externalId, rating, source, userId, comment);
      
      if (!ratingResult.success) {
        console.error('[rateServer] Rating submission failed:', ratingResult);
        return {
          success: false,
          error: ratingResult.error || 'Failed to submit rating to registry'
        };
      }
      
      console.log('[rateServer] Rating submitted successfully');

      // TODO: Track rating and comment events to new analytics service when available
      
      return { success: true };
    } else if (serverUuid) {
      // For local PluggedIn servers, we'll need to implement this later
      // TODO: Track rating to new analytics service when available
      
      return { success: true };
    }

    return { 
      success: false, 
      error: 'Invalid server configuration' 
    };
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
    // For registry/community servers, get stats from registry
    if (params.source === McpServerSource.REGISTRY || params.source === McpServerSource.COMMUNITY) {
      const stats = await registryVPClient.getServerStats(params.externalId);
      
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
    
    // Analytics API deprecated - return default values until new analytics service is ready
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

 