import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import type { McpServerSource } from '@/db/schema';
import { serverInstallationsTable, serverReviews } from '@/db/schema';
import { MetricsResponse } from '@/types/reviews';

export async function getServerRatingMetrics(
  source: McpServerSource,
  externalId: string,
  page = 1, // Keep pagination params if needed for reviews
  limit = 10
): Promise<MetricsResponse> {
  try {
    const offset = (page - 1) * limit;

    // Get aggregate rating metrics from serverReviews
    const ratingQuery = db
      .select({
        averageRating: sql<number>`COALESCE(avg(${serverReviews.rating}), 0)`,
        ratingCount: sql<number>`count(${serverReviews.rating})`,
      })
      .from(serverReviews)
      .where(
        and(
          eq(serverReviews.server_external_id, externalId),
          eq(serverReviews.server_source, source)
        )
      );
    
    const ratingResults = await ratingQuery;
    const ratingMetrics = ratingResults[0] || { averageRating: 0, ratingCount: 0 }; // Default if no ratings

    // Get installation count from serverInstallationsTable
    const installationQuery = db
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

    const installationResults = await installationQuery;
    const installationMetrics = installationResults[0] || { installationCount: 0 }; // Default if no installations

    // Get paginated reviews with usernames from serverReviews
    const reviewsQuery = await db.query.serverReviews.findMany({
      where: and(
        eq(serverReviews.server_external_id, externalId),
        eq(serverReviews.server_source, source)
      ),
      with: {
        user: { // Use the relation defined in schema
          columns: {
            username: true,
          }
        }
      },
      limit,
      offset,
      orderBy: (reviews, { desc }) => [desc(reviews.created_at)] // Use correct table alias
    });

    return {
      success: true,
      metrics: {
        averageRating: ratingMetrics.averageRating,
        ratingCount: ratingMetrics.ratingCount,
        installationCount: installationMetrics.installationCount,
        reviews: reviewsQuery.map(review => ({
          id: review.uuid, // Use uuid from serverReviews
          rating: review.rating,
          comment: review.comment,
          created_at: review.created_at,
          // Ensure username is accessed correctly, handle potential null user
          username: review.user?.username || 'Unknown User' 
        }))
      }
    };
  } catch (error) {
    console.error('Error fetching server metrics:', error);
    return {
      success: false,
      error: 'Failed to fetch server metrics'
    };
  }
}
