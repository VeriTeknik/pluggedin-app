import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { sharedCollectionsTable } from '@/db/schema';

/**
 * @swagger
 * /api/user/{username}/collections:
 *   get:
 *     summary: Get public collections shared by a specific user
 *     description: Retrieves a list of collections that a user has publicly shared.
 *     tags:
 *       - Users
 *       - Collections
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: The username of the user whose public collections are to be fetched.
 *     responses:
 *       200:
 *         description: A list of publicly shared collections for the specified user, sorted by creation date (newest first).
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SharedCollection' # Assuming a schema definition exists or will be created
 *       400:
 *         description: Bad Request - Username parameter is missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Username is required
 *       500:
 *         description: Internal Server Error - Failed to fetch collections.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to fetch user collections
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await context.params;
    
    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Find the user's profile and associated collections
    const collections = await db.query.sharedCollectionsTable.findMany({
      where: and(
        eq(sharedCollectionsTable.is_public, true)
      ),
      with: {
        profile: {
          with: {
            project: {
              with: {
                user: {
                  columns: {
                    username: true,
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    });

    // Filter collections for the specific username
    const userCollections = collections.filter(
      collection => collection.profile?.project?.user?.username === username
    );
    
    // Sort by created_at in descending order
    const sortedCollections = [...userCollections].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    return NextResponse.json(sortedCollections);
  } catch (error) {
    console.error('Error fetching user collections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user collections' },
      { status: 500 }
    );
  }
}
