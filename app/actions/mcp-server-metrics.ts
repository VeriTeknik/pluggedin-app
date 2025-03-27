'use server';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { 
  mcpServersTable, 
  McpServerSource, 
  serverInstallationsTable, 
  serverRatingsTable 
} from '@/db/schema';

/**
 * Track a server installation
 */
export async function trackServerInstallation(
  profileUuid: string,
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
      server_uuid: serverUuid,
      external_id: externalId,
      source: source || McpServerSource.PLUGGEDIN,
    });

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