import {eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { mcpServersTable, profilesTable, projectsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

// Define schema for PATCH request body
const updateServerSchema = z.object({
  notes: z.string().nullable().optional(), // Allow notes to be updated or cleared
  // Add other updatable fields here if needed in the future
       // e.g., name: z.string().optional(),
       //       status: z.nativeEnum(McpServerStatus).optional(),
});

/**
 * @swagger
 * /api/mcp-servers/{uuid}:
 *   patch:
 *     summary: Update MCP server details
 *     description: Updates specific fields (currently only 'notes') for an MCP server identified by its UUID. Requires user session authentication (logged-in user). Note The global API key security definition does not apply here; this endpoint uses session cookies.
 *     tags:
 *       - MCP Servers
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The UUID of the MCP server to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 nullable: true
 *                 description: The notes to associate with the server. Set to null to clear existing notes.
 *     responses:
 *       200:
 *         description: Successfully updated the MCP server notes.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/McpServer' # Assuming McpServer schema is defined
 *       400:
 *         description: Bad Request - Invalid request body.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Invalid request body
 *                 details:
 *                   type: object # Zod error details
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
 *         description: Not Found - Server not found or user is not authorized to update it.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Server not found or unauthorized
 *       500:
 *         description: Internal Server Error - Failed to update the server.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to update server
 *                 details:
 *                   type: string
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid: serverUuid } = await params;
  
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const body = await request.json();
    const parseResult = updateServerSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parseResult.error.flatten() }, { status: 400 });
    }

    const { notes } = parseResult.data;

    // 1. Authorize: Verify the user owns the server via project/profile
    const server = await db
      .select({
        uuid: mcpServersTable.uuid,
        profile_uuid: mcpServersTable.profile_uuid,
        user_id: projectsTable.user_id
      })
      .from(mcpServersTable)
      .leftJoin(profilesTable, eq(mcpServersTable.profile_uuid, profilesTable.uuid))
      .leftJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
      .where(eq(mcpServersTable.uuid, serverUuid))
      .then(rows => rows[0]);

    if (!server?.user_id || server.user_id !== userId) {
      return NextResponse.json({ error: 'Server not found or unauthorized' }, { status: 404 });
    }

    // 2. Update the server notes
    const [updatedServer] = await db
      .update(mcpServersTable)
      .set({
        notes: notes, // Update notes (can be null to clear)
        // Add other fields here if they become updatable
      })
      .where(eq(mcpServersTable.uuid, serverUuid))
      .returning(); // Return the updated record

    if (!updatedServer) {
       // Should not happen if authorization check passed, but good practice
       return NextResponse.json({ error: 'Failed to update server, server not found after authorization.' }, { status: 404 });
    }

    console.log(`Updated notes for server ${serverUuid}`);
    return NextResponse.json(updatedServer);

  } catch (error: any) {
    console.error(`Error updating server ${serverUuid}:`, error);
    return NextResponse.json({ error: 'Failed to update server', details: error.message }, { status: 500 });
  }
}

// TODO: Implement DELETE handler if needed
// export async function DELETE(...) { ... }
