import { and,eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { embeddedChatsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

/**
 * @swagger
 * /api/profile/{profileId}/embedded-chats:
 *   get:
 *     summary: Get public and active embedded chats for a specific profile
 *     description: Retrieves a list of embedded chats that are marked as public and active under a specific profile ID. This endpoint does not require authentication.
 *     tags:
 *       - Profiles
 *       - Shared Content
 *       - Embedded Chats
 *     parameters:
 *       - in: path
 *         name: profileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The UUID of the profile whose public and active embedded chats are to be fetched.
 *     responses:
 *       200:
 *         description: A list of public and active embedded chats for the specified profile, sorted by creation date (newest first).
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/EmbeddedChatWithProfile' # Assuming a schema definition exists or will be created that includes profile details
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
 *         description: Internal Server Error - Failed to fetch embedded chats.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to fetch embedded chats
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
    
    // Fetch public and active embedded chats for this profile
    const embeddedChats = await db.query.embeddedChatsTable.findMany({
      where: and(
        eq(embeddedChatsTable.profile_uuid, profileId),
        eq(embeddedChatsTable.is_public, true),
        eq(embeddedChatsTable.is_active, true)
      ),
      with: {
        profile: {
          columns: {
            uuid: true,
            name: true,
            project_uuid: true
          }
        }
      }
    });
    
    // Sort by created_at in memory
    const sortedChats = [...embeddedChats].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    return NextResponse.json(sortedChats);
  } catch (error) {
    console.error('Error fetching embedded chats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch embedded chats' },
      { status: 500 }
    );
  }
}
