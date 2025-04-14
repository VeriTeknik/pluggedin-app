import { and,eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { sharedCollectionsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

/**
 * @swagger
 * /api/profile/{profileId}/shared-collections:
 *   get:
 *     summary: Get public collections shared by a specific profile
 *     description: Retrieves a list of collections that have been publicly shared under a specific profile ID. This endpoint does not require authentication.
 *     tags:
 *       - Profiles
 *       - Shared Content
 *       - Collections
 *     parameters:
 *       - in: path
 *         name: profileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The UUID of the profile whose publicly shared collections are to be fetched.
 *     responses:
 *       200:
 *         description: A list of publicly shared collections for the specified profile, sorted by creation date (newest first).
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SharedCollectionWithProfile' # Assuming a schema definition exists or will be created that includes profile details
 *       400:
 *         description: Bad Request - Profile ID parameter is missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Profile ID is required
 *       500:
 *         description: Internal Server Error - Failed to fetch shared collections.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to fetch shared collections
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ profileId: string }> }
) {
  try {
    const session = await getAuthSession();
    const { profileId } = await context.params;
    
    if (!profileId) {
      return NextResponse.json(
        { error: 'Profile ID is required' },
        { status: 400 }
      );
    }
    
    // Fetch public shared collections for this profile
    const sharedCollections = await db.query.sharedCollectionsTable.findMany({
      where: and(
        eq(sharedCollectionsTable.profile_uuid, profileId),
        eq(sharedCollectionsTable.is_public, true)
      ),
      with: {
        profile: {
          columns: {
            uuid: true,
            name: true,
            project_uuid: true
          }
        }
      },
    });
    
    // Sort by created_at in memory since we're having issues with the orderBy syntax
    const sortedCollections = [...sharedCollections].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    return NextResponse.json(sortedCollections);
  } catch (error) {
    console.error('Error fetching shared collections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shared collections' },
      { status: 500 }
    );
  }
}
