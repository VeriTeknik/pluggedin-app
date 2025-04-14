import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getSharedCollection } from '@/app/actions/social';
import { db } from '@/db';
import { McpServerSource, mcpServersTable,McpServerStatus, McpServerType } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

/**
 * @swagger
 * /api/collections/import:
 *   post:
 *     summary: Import servers from a shared collection
 *     description: Imports the MCP server configurations defined within a specified shared collection into the authenticated user's current active profile. If a server with the same name already exists in the profile, it is skipped. Requires user session authentication. Note The global API key security definition does not apply here; this endpoint uses session cookies.
 *     tags:
 *       - Collections
 *       - MCP Servers
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - collectionUuid
 *             properties:
 *               collectionUuid:
 *                 type: string
 *                 format: uuid
 *                 description: The UUID of the shared collection to import servers from.
 *               importType:
 *                 type: string
 *                 enum: [current, new]
 *                 description: Specifies where to import the servers (currently only 'current' profile is implemented, 'new' might create a new profile/workspace in the future).
 *                 default: current
 *     responses:
 *       200:
 *         description: Collection imported successfully. Returns a list of newly created server records.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Collection imported successfully
 *                 servers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/McpServer' # Assuming McpServer schema is defined
 *       400:
 *         description: Bad Request - Collection UUID is missing in the request body.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Collection UUID is required
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
 *         description: Not Found - The specified collection UUID does not exist or is not shared.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Collection not found
 *       500:
 *         description: Internal Server Error - Failed to import the collection.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to import collection
 */
export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { collectionUuid, importType } = body;

    if (!collectionUuid) {
      return NextResponse.json({ error: 'Collection UUID is required' }, { status: 400 });
    }

    const collection = await getSharedCollection(collectionUuid);
    if (!collection) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
    }

    // TODO: Handle importType === 'new' by creating a new workspace
    // For now, we'll just import to the current workspace

    // Import each server from the collection
    const importedServers = [];
    for (const [serverName, serverConfig] of Object.entries(collection.content)) {
      // Check if server already exists
      const existingServer = await db.query.mcpServersTable.findFirst({
        where: eq(mcpServersTable.name, serverName)
      });

      if (!existingServer) {
        // Create new server
        const newServer = await db.insert(mcpServersTable).values({
          name: serverName,
          description: (serverConfig as any).description || '',
          type: McpServerType.STDIO,
          command: (serverConfig as any).command || '',
          args: (serverConfig as any).args || [],
          env: (serverConfig as any).env || {},
          url: (serverConfig as any).url || '',
          profile_uuid: session.user.id,
          status: McpServerStatus.ACTIVE,
          source: McpServerSource.PLUGGEDIN,
          external_id: (serverConfig as any).external_id || null,
          notes: (serverConfig as any).notes || '',
        }).returning();
        importedServers.push(newServer[0]);
      }
    }

    return NextResponse.json({
      message: 'Collection imported successfully',
      servers: importedServers
    });
  } catch (error) {
    console.error('Error importing collection:', error);
    return NextResponse.json(
      { error: 'Failed to import collection' },
      { status: 500 }
    );
  }
}
