'use server';

import { analyticsAPIClient } from '@/lib/analytics/analytics-api-client';
import { McpServerSource } from '@/db/schema';
import { ServerReview } from '@/types/review';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function getReviewsForServer(
  source: McpServerSource,
  externalId: string
): Promise<ServerReview[]> {
  try {
    // Get ratings and comments from analytics API
    const [ratingsData, commentsData] = await Promise.all([
      analyticsAPIClient.getRatings(externalId, 100), // Get more ratings
      analyticsAPIClient.getComments(externalId, 100), // Get more comments
    ]);

    if (!ratingsData || !commentsData) {
      return [];
    }

    // Get unique user IDs from both ratings and comments
    const userIds = new Set<string>();
    ratingsData.ratings.forEach(r => userIds.add(r.user_id));
    commentsData.comments.forEach(c => userIds.add(c.user_id));

    // Fetch user data for all unique user IDs
    const userDataMap = new Map();
    if (userIds.size > 0) {
      await db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          avatar_url: users.avatar_url,
          image: users.image,
        })
        .from(users)
        .where(eq(users.id, Array.from(userIds)[0])); // This needs to be fixed for multiple users
      
      // For now, just get users one by one (not optimal, but works)
      for (const userId of userIds) {
        const userData = await db
          .select({
            id: users.id,
            name: users.name,
            username: users.username,
            avatar_url: users.avatar_url,
            image: users.image,
          })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        
        if (userData[0]) {
          userDataMap.set(userId, userData[0]);
        }
      }
    }

    // Combine ratings and comments into reviews
    const reviews: ServerReview[] = [];

    // Add ratings with comments
    ratingsData.ratings.forEach(rating => {
      const comment = rating.comment;
      const user = userDataMap.get(rating.user_id);
      
      if (comment || rating.rating) {
        reviews.push({
          uuid: `rating-${rating.server_id}-${rating.user_id}`,
          server_source: source,
          server_external_id: externalId,
          user_id: rating.user_id,
          rating: rating.rating,
          comment: comment || null,
          created_at: new Date(rating.timestamp),
          updated_at: new Date(rating.timestamp),
          user: user || {
            id: rating.user_id,
            name: null,
            username: 'Anonymous',
            avatar_url: null,
            image: null,
          },
        });
      }
    });

    // Add standalone comments (not associated with ratings)
    commentsData.comments.forEach(comment => {
      // Check if we already have this comment from ratings
      const hasRating = ratingsData.ratings.some(
        r => r.user_id === comment.user_id && r.comment === comment.comment
      );
      
      if (!hasRating) {
        const user = userDataMap.get(comment.user_id);
        
        reviews.push({
          uuid: comment.id,
          server_source: source,
          server_external_id: externalId,
          user_id: comment.user_id,
          rating: 0, // No rating for standalone comments
          comment: comment.comment,
          created_at: new Date(comment.timestamp),
          updated_at: comment.updated_at ? new Date(comment.updated_at) : new Date(comment.timestamp),
          user: user || {
            id: comment.user_id,
            name: null,
            username: 'Anonymous',
            avatar_url: null,
            image: null,
          },
        });
      }
    });

    // Sort by created_at descending
    reviews.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

    return reviews;
  } catch (error) {
    console.error('Error fetching server reviews:', error);
    return [];
  }
}

// Action to submit or update a server review
export async function submitReview(reviewData: {
  server_source: McpServerSource;
  server_external_id: string;
  user_id: string;
  rating: number;
  comment?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Submit rating to analytics API
    const ratingResult = await analyticsAPIClient.submitRating(
      reviewData.server_external_id,
      reviewData.user_id,
      reviewData.rating,
      reviewData.comment || undefined
    );

    if (!ratingResult.success) {
      return {
        success: false,
        error: ratingResult.error || 'Failed to submit rating',
      };
    }

    // If comment is provided separately (without rating), submit it
    if (reviewData.comment && !reviewData.rating) {
      const commentResult = await analyticsAPIClient.submitComment(
        reviewData.server_external_id,
        reviewData.user_id,
        reviewData.comment
      );

      if (!commentResult.success) {
        return {
          success: false,
          error: commentResult.error || 'Failed to submit comment',
        };
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error submitting server review:', error);
    return {
      success: false,
      error: error.message || 'An unknown error occurred while submitting the review.',
    };
  }
}
