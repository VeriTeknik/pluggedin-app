'use server';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { profilesTable } from '@/db/schema';
import { registryVPClient } from '@/lib/registry/pluggedin-registry-vp-client';

/**
 * Get user's existing rating for a server from the registry
 */
export async function getUserRating(
  profileUuid: string,
  serverId: string
): Promise<{ rating?: number; comment?: string; feedbackId?: string } | null> {
  try {
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
      return null;
    }

    const userId = profileData.project.user_id;

    // Check registry for user's rating
    const userRatingResponse = await registryVPClient.getUserRating(serverId, userId);

    if (userRatingResponse.has_rated && userRatingResponse.feedback) {
      return {
        rating: userRatingResponse.feedback.rating,
        comment: userRatingResponse.feedback.comment,
        feedbackId: userRatingResponse.feedback.id
      };
    }

    return null;
  } catch (error) {
    console.error('Error getting user rating:', error);
    return null;
  }
}

/**
 * Batch fetch user ratings for multiple servers
 * Returns a map of serverId -> user rating
 */
export async function getUserRatingsForServers(
  profileUuid: string,
  serverIds: string[]
): Promise<Record<string, { rating: number; comment?: string }>> {
  try {
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
      return {};
    }

    const userId = profileData.project.user_id;
    const userRatings: Record<string, { rating: number; comment?: string }> = {};

    // Fetch ratings for each server (in parallel)
    await Promise.all(
      serverIds.map(async (serverId) => {
        try {
          const response = await registryVPClient.getUserRating(serverId, userId);
          if (response.has_rated && response.feedback) {
            userRatings[serverId] = {
              rating: response.feedback.rating,
              comment: response.feedback.comment
            };
          }
        } catch (error) {
          // Continue with other servers if one fails
          console.error(`Failed to fetch rating for ${serverId}:`, error);
        }
      })
    );

    return userRatings;
  } catch (error) {
    console.error('Error getting user ratings:', error);
    return {};
  }
}