'use server';

import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { serverReviews, users } from '@/db/schema'; // Assuming serverReviews table exists
import { McpServerSource } from '@/db/schema';
import { ServerReview } from '@/types/review';

export async function getReviewsForServer(
  source: McpServerSource,
  externalId: string
): Promise<ServerReview[]> {
  try {
    const reviews = await db
      .select({
        uuid: serverReviews.uuid,
        server_source: serverReviews.server_source,
        server_external_id: serverReviews.server_external_id,
        user_id: serverReviews.user_id,
        rating: serverReviews.rating,
        comment: serverReviews.comment,
        created_at: serverReviews.created_at,
        updated_at: serverReviews.updated_at,
        user: { // Select specific user fields to avoid exposing sensitive data
          id: users.id,
          name: users.name,
          username: users.username,
          avatar_url: users.avatar_url,
          image: users.image,
        },
      })
      .from(serverReviews)
      .leftJoin(users, eq(serverReviews.user_id, users.id))
      .where(
        and(
          eq(serverReviews.server_source, source),
          eq(serverReviews.server_external_id, externalId)
        )
      )
      .orderBy(desc(serverReviews.created_at));

    // Ensure the return type matches ServerReview[]
    // The select statement is structured to match the desired output including the nested user object
    return reviews as ServerReview[];

  } catch (error) {
    console.error('Error fetching server reviews:', error);
    // In a real application, you might want more robust error handling
    // For now, re-throwing or returning an empty array might be options
    // Returning empty array to prevent crashing the dialog
    return [];
  }
}

// TODO: Add action to submit a new review
// export async function submitReview(...) { ... }
