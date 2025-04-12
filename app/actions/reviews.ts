'use server';

import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { McpServerSource, serverReviews, users } from '@/db/schema'; // Use serverReviews table
import { ServerReview } from '@/types/review';
// import { revalidatePath } from 'next/cache'; // Removed unused import

export async function getReviewsForServer(
  source: McpServerSource,
  externalId: string
): Promise<ServerReview[]> {
  try {
    const reviewsData = await db
      .select({
        // Select fields from serverReviews table
        uuid: serverReviews.uuid,
        server_source: serverReviews.server_source,
        server_external_id: serverReviews.server_external_id,
        user_id: serverReviews.user_id,
        rating: serverReviews.rating,
        comment: serverReviews.comment,
        created_at: serverReviews.created_at,
        updated_at: serverReviews.updated_at,
        // Select user fields from the joined users table
        user: {
          id: users.id,
          name: users.name,
          username: users.username,
          avatar_url: users.avatar_url,
          image: users.image, // Keep user image if needed, or remove if not in ServerReview type
        },
      })
      .from(serverReviews) // Query from serverReviews table
      .leftJoin(users, eq(serverReviews.user_id, users.id)) // Join using correct text user_id
      .where(
        and(
          // Filter using columns from serverReviews table
          eq(serverReviews.server_source, source),
          eq(serverReviews.server_external_id, externalId)
        )
      )
      .orderBy(desc(serverReviews.created_at)); // Order by created_at from serverReviews

    // Directly return the fetched data, ensuring it matches ServerReview type
    // No need for casting if select statement is correct
    return reviewsData as ServerReview[];
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
}): Promise<{ success: boolean; error?: string; review?: ServerReview }> {
  try {
    const result = await db
      .insert(serverReviews)
      .values({
        server_source: reviewData.server_source,
        server_external_id: reviewData.server_external_id,
        user_id: reviewData.user_id,
        rating: reviewData.rating,
        comment: reviewData.comment ?? null, // Ensure null if undefined
        // created_at and updated_at are handled by the DB default/update triggers
      })
      .onConflictDoUpdate({
        target: [
          serverReviews.user_id,
          serverReviews.server_source,
          serverReviews.server_external_id,
        ],
        set: {
          rating: reviewData.rating,
          comment: reviewData.comment ?? null,
          updated_at: new Date(), // Explicitly set updated_at on conflict
        },
      })
      .returning(); // Return the inserted/updated row

    if (result.length === 0) {
      throw new Error('Failed to insert or update review.');
    }

    // Revalidate relevant paths if needed, e.g., the search page or server detail page
    // Example: revalidatePath('/search');

    return { success: true, review: result[0] as ServerReview };
  } catch (error: any) {
    console.error('Error submitting server review:', error);
    return {
      success: false,
      error: error.message || 'An unknown error occurred while submitting the review.',
    };
  }
}
