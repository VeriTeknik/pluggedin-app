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