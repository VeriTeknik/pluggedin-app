import { and, asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server'; // External imports after internal

import { db } from '@/db';
import { mcpServersTable, profilesTable, projectsTable, resourcesTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth'; // Internal imports first

export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/mcp-servers/{uuid}/resources:
 *   get:
 *     summary: Get discovered static resources for a specific MCP server
 *     description: Retrieves a list of all static resources discovered for a specific MCP server, identified by its UUID. Requires user session authentication (logged-in user). Note The global API key security definition does not apply here; this endpoint uses session cookies.
 *     tags:
 *       - MCP Servers
 *       - Resources
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The UUID of the MCP server whose resources are to be fetched.
 *     responses:
 *       200:
 *         description: Successfully retrieved the list of resources, ordered by name.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Resource' # Assuming Resource schema is defined
 *       400:
 *         description: Bad Request - Server UUID parameter is missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Missing server UUID parameter
 *       401:
 *         description: Unauthorized - User session is invalid or missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unauthorized: User not logged in.
 *       404:
 *         description: Not Found - Server not found or user is not authorized to access it.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Server not found or user does not have access.
 *       500:
 *         description: Internal Server Error - Failed to fetch server resources.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Internal Server Error fetching server resources
 *                 details:
 *                   type: string
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ uuid: string }> } // Use Promise type and destructure
) {
  try {
    // 1. Authenticate user session
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
    }
    const userId = session.user.id;

    const { uuid: serverUuid } = await params; // Await params and destructure uuid
    if (!serverUuid) {
      return NextResponse.json({ error: 'Missing server UUID parameter' }, { status: 400 });
    }

    // 2. Verify the server belongs to the authenticated user
    // Join mcpServers -> profiles -> projects to check user_id
    const serverCheck = await db
        .select({ serverId: mcpServersTable.uuid })
        .from(mcpServersTable)
        .innerJoin(profilesTable, eq(mcpServersTable.profile_uuid, profilesTable.uuid))
        .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
        .where(and(
            eq(mcpServersTable.uuid, serverUuid),
            eq(projectsTable.user_id, userId) // Check ownership via project
        ))
        .limit(1);

    if (serverCheck.length === 0) {
        return NextResponse.json({ error: 'Server not found or user does not have access.' }, { status: 404 });
    }

    // 3. Query the resources table for the specific server UUID
    const resources = await db
      .select() // Select all columns from resourcesTable - assumes this matches expected output structure
      .from(resourcesTable)
      .where(eq(resourcesTable.mcp_server_uuid, serverUuid))
      .orderBy(asc(resourcesTable.name)); // Optional ordering

    // 4. Return the list of resources
    return NextResponse.json(resources);

  } catch (error) {
    // Log using the extracted serverUuid if available
    // Note: params might not be available in catch block if await failed
    console.error(`[API /api/mcp-servers/[uuid]/resources Error]`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error fetching server resources', details: errorMessage }, { status: 500 });
  }
}
