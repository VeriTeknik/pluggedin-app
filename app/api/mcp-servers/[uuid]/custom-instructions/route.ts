import { and, eq } from 'drizzle-orm'; // Then external
import { NextResponse } from 'next/server'; // External first

import { db } from '@/db';
import { customInstructionsTable, mcpServersTable, profilesTable, projectsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth'; // Then internal

export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/mcp-servers/{uuid}/custom-instructions:
 *   get:
 *     summary: Get custom instructions for a specific MCP server
 *     description: Retrieves the custom instructions associated with a specific MCP server, identified by its UUID. Requires user session authentication (logged-in user). Note The global API key security definition does not apply here; this endpoint uses session cookies.
 *     tags:
 *       - MCP Servers
 *       - Custom Instructions
 *     parameters:
 *       - in: path
 *         name: uuid
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The UUID of the MCP server whose custom instructions are to be fetched.
 *     responses:
 *       200:
 *         description: Successfully retrieved the custom instructions. Returns the instruction object or null if none are set.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/CustomInstruction' # Assuming CustomInstruction schema is defined
 *                 - type: 'null'
 *                   description: Returned when no custom instructions are set for the server.
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
 *         description: Internal Server Error - Failed to fetch custom instructions.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Internal Server Error fetching custom instructions
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

    // 3. Query the custom instructions table for the specific server UUID
    const instructions = await db
      .select() // Select all columns from customInstructionsTable
      .from(customInstructionsTable)
      .where(eq(customInstructionsTable.mcp_server_uuid, serverUuid))
      .limit(1); // Expecting only one record per server due to unique constraint

    // 4. Return the instructions record (or null/empty object if none found)
    // The findFirst method in the action might be better, but this works too
    if (instructions.length === 0) {
        // Return a default structure or null if no instructions are set
        return NextResponse.json(null); // Or return an empty object {} or default structure
    }
    return NextResponse.json(instructions[0]);

  } catch (error) {
    // Log using the extracted serverUuid if available
    // Note: params might not be available in catch block if await failed
    console.error(`[API /api/mcp-servers/[uuid]/custom-instructions Error]`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error fetching custom instructions', details: errorMessage }, { status: 500 });
  }
}

// POST/PUT handler could be added here later for saving via API if needed,
// but currently using server actions (upsertCustomInstructions).
