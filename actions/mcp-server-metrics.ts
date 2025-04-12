import { db } from '@/db';
import { mcpServerRatings as mcpServerRatingsTable, mcpServers as mcpServersTable, type McpServerSource } from '@/db/schema';
import { MetricsResponse } from '@/types/reviews';
import { eq, and, type SQL, type InferSelectModel } from 'drizzle-orm';

export async function getServerRatingMetrics(
  source: McpServerSource,
  externalId: string,
  page = 1,
  limit = 10
): Promise<MetricsResponse> {
  try {
    const offset = (page - 1) * limit;

    // Get aggregate metrics
    const metricsResult = await db.query.mcpServerRatingsTable.findMany({
      where: (ratings: InferSelectModel<typeof mcpServerRatingsTable>, { eq, and }: { eq: typeof eq, and: typeof and }) => 
        and(eq(ratings.source, source), eq(ratings.external_id, externalId)),
      columns: {
        rating: true,
      }
    });

    // Calculate metrics
    const ratings = metricsResult.map(r => r.rating);
    const ratingCount = ratings.length;
    const averageRating = ratingCount > 0 
      ? ratings.reduce((a: number, b: number) => a + b, 0) / ratingCount 
      : 0;

    // Get installation count
    const installCount = await db.query.mcpServersTable.findMany({
      where: (servers: InferSelectModel<typeof mcpServersTable>, { eq, and }: { eq: typeof eq, and: typeof and }) =>
        and(eq(servers.source, source), eq(servers.external_id, externalId)),
      columns: {
        uuid: true,
      }
    });

    // Get paginated reviews with usernames
    const reviews = await db.query.mcpServerRatingsTable.findMany({
      where: (ratings: InferSelectModel<typeof mcpServerRatingsTable>, { eq, and }: { eq: typeof eq, and: typeof and }) =>
        and(eq(ratings.source, source), eq(ratings.external_id, externalId)),
      with: {
        user: {
          columns: {
            username: true,
          }
        }
      },
      limit,
      offset,
      orderBy: (ratings, { desc }) => [desc(ratings.created_at)]
    });

    return {
      success: true,
      metrics: {
        averageRating,
        ratingCount,
        installationCount: installCount.length,
        reviews: reviews.map(review => ({
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          created_at: review.created_at,
          username: review.user.username
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