import { and,eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { sharedMcpServersTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

/**
 * @swagger
 * /api/profile/{profileId}/shared-servers:
 *   get:
 *     summary: Get public servers shared by a specific profile
 *     description: Retrieves a list of MCP servers that have been publicly shared under a specific profile ID. This endpoint does not require authentication.
 *     tags:
 *       - Profiles
 *       - Shared Content
 *       - MCP Servers
 *     parameters:
 *       - in: path
 *         name: profileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The UUID of the profile whose publicly shared servers are to be fetched.
 *     responses:
 *       200:
 *         description: A list of publicly shared servers for the specified profile, sorted by creation date (newest first).
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SharedMcpServerWithDetails' # Assuming a schema definition exists or will be created that includes server/profile details
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
 *         description: Internal Server Error - Failed to fetch shared servers.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to fetch shared servers
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
    
    // Fetch public shared servers for this profile
    const sharedServers = await db.query.sharedMcpServersTable.findMany({
      where: and(
        eq(sharedMcpServersTable.profile_uuid, profileId),
        eq(sharedMcpServersTable.is_public, true)
      ),
      with: {
        server: {
          columns: {
            uuid: true,
            name: true,
            description: true,
            type: true,
            command: true,
            args: true,
            url: true,
            created_at: true,
            status: true,
            source: true,
          }
        },
        profile: {
          columns: {
            uuid: true,
            name: true,
            project_uuid: true,
          }
        }
      },
    });
    
    // Sort by created_at in memory since we're having issues with the orderBy syntax
    const sortedServers = [...sharedServers].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    return NextResponse.json(sortedServers);
  } catch (error) {
    console.error('Error fetching shared servers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shared servers' },
      { status: 500 }
    );
  }
}
