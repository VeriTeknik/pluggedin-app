import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { sharedCollectionsTable } from '@/db/schema';

/**
 * @swagger
 * /api/collections:
 *   get:
 *     summary: Get all public collections
 *     description: Retrieves a list of all collections that have been marked as public by their owners, including basic user information. This endpoint does not require authentication.
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
    // Fetch all public collections with profile, project, and user info
    const collections = await db.query.sharedCollectionsTable.findMany({
      where: eq(sharedCollectionsTable.is_public, true),
      with: {
        profile: {
          with: {
            project: {
              with: {
                user: {
                  columns: {
                    id: true,
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

    return NextResponse.json(collections);
  } catch (error) {
    console.error('Error fetching collections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch collections' },
      { status: 500 }
    );
  }
}
