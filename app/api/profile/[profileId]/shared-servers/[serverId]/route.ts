import { and, eq } from 'drizzle-orm';
import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { sharedMcpServersTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

/**
 * @swagger
 * /api/profile/{profileId}/shared-servers/{serverId}:
 *   delete:
 *     summary: Unshare a specific MCP server from a profile
 *     description: Removes the sharing record for a specific MCP server from a specific profile. Requires user session authentication, and the user must own the profile. Note The global API key security definition does not apply here; this endpoint uses session cookies.
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
 *         description: The UUID of the profile from which the server is shared.
 *       - in: path
 *         name: serverId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The UUID of the shared server record to delete (this is the UUID from the `shared_mcp_servers` table, not the original server's UUID).
 *     responses:
 *       200:
 *         description: Successfully unshared the server.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Bad Request - Profile ID or Server ID parameter is missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Profile ID and Server ID are required
 *       401:
 *         description: Unauthorized - User session is invalid or missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unauthorized
 *       404:
 *         description: Not Found - Shared server record not found or user does not have permission to delete it.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Server not found or you do not have permission to delete it
 *       500:
 *         description: Internal Server Error - Failed to delete the shared server record.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to delete shared server
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ profileId: string; serverId: string }> }
): Promise<NextResponse> {
  try {
    const session = await getAuthSession();
    const { profileId, serverId } = await params;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!profileId || !serverId) {
      return NextResponse.json(
        { error: 'Profile ID and Server ID are required' },
        { status: 400 }
      );
    }

    // Delete the shared server
    const [deletedServer] = await db.delete(sharedMcpServersTable)
      .where(
        and(
          eq(sharedMcpServersTable.profile_uuid, profileId),
          eq(sharedMcpServersTable.uuid, serverId)
        )
      )
      .returning();

    if (!deletedServer) {
      return NextResponse.json(
        { error: 'Server not found or you do not have permission to delete it' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting shared server:', error);
    return NextResponse.json(
      { error: 'Failed to delete shared server' },
      { status: 500 }
    );
  }
}
