import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { sharedCollectionsTable } from '@/db/schema';
import { sanitizeCollectionContent } from '@/lib/server-template';

/**
 * @swagger
 * /api/collections:
 *   get:
 *     summary: Get all public collections
 *     description: Retrieves a list of all collections that have been marked as public by their owners, with the profile's uuid and name and the owner's display name and username. This endpoint does not require authentication.
 *     tags:
 *       - Collections
 *     responses:
 *       200:
 *         description: A list of all publicly shared collections, ordered by creation date.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SharedCollectionWithUser' # Assuming a schema definition exists or will be created that includes user details
 *       500:
 *         description: Internal Server Error - Failed to fetch collections.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to fetch collections
 */
export async function GET() {
  try {
    // Anonymous endpoint: select only what is returned — the profile's uuid
    // and name and the owner's display fields. Never the project row
    // (uuid, user_id, active_profile_uuid) or the user id.
    const collections = await db.query.sharedCollectionsTable.findMany({
      where: eq(sharedCollectionsTable.is_public, true),
      with: {
        profile: {
          columns: { uuid: true, name: true },
          with: {
            project: {
              columns: {},
              with: {
                user: {
                  columns: {
                    name: true,
                    username: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: (collections) => [collections.created_at],
    });

    // Project explicitly as well, so a relation change cannot widen the response.
    return NextResponse.json(
      collections.map((c) => ({
        ...c,
        profile: c.profile
          ? {
              uuid: c.profile.uuid,
              name: c.profile.name,
              project: {
                user: c.profile.project?.user
                  ? { name: c.profile.project.user.name, username: c.profile.project.user.username }
                  : null,
              },
            }
          : null,
        content: sanitizeCollectionContent(c.content),
      }))
    );
  } catch (error) {
    console.error('Error fetching collections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collections' },
      { status: 500 }
    );
  }
}
