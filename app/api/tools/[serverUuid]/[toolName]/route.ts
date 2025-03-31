// app/api/tools/[serverUuid]/[toolName]/route.ts
import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { authenticateApiKey } from '@/app/api/auth';
import { db } from '@/db';
import { mcpServersTable, toolsTable } from '@/db/schema';


/**
 * @swagger
 * /api/tools/{serverUuid}/{toolName}:
 *   get:
 *     summary: Get details for a specific tool
 *     description: Retrieves the detailed information (including schema) for a specific tool identified by its parent server UUID and tool name, ensuring it belongs to the authenticated user's active profile. Requires API key authentication. This is used by the pluggedin-mcp proxy when reading tool resources.
 *     tags:
 *       - Tools
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: serverUuid
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The UUID of the parent MCP server.
 *       - in: path
 *         name: toolName
 *         required: true
 *         schema:
 *           type: string
 *         description: The name of the tool.
 *     responses:
 *       200:
 *         description: Successfully retrieved the tool details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tool:
 *                   $ref: '#/components/schemas/Tool' # Assuming Tool schema is defined
 *       401:
 *         description: Unauthorized - Invalid or missing API key or profile.
 *       404:
 *         description: Not Found - Tool not found for the given server UUID and tool name, or not associated with the active profile.
 *       500:
 *         description: Internal Server Error.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serverUuid: string; toolName: string }> }
) {
  try {
    const { serverUuid, toolName } = await params;
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    // Ensure activeProfile is available after authentication
    if (!auth.activeProfile) {
       return NextResponse.json(
        { error: 'Active profile not found after authentication' },
        { status: 401 } // Unauthorized or Bad Request might be appropriate
      );
    }

    // Fetch the specific tool associated with the authenticated user's active profile
    const tool = await db
      .select({
        uuid: toolsTable.uuid,
        name: toolsTable.name,
        description: toolsTable.description,
        toolSchema: toolsTable.toolSchema, // Changed from inputSchema based on schema.ts
        status: toolsTable.status,
        mcp_server_uuid: toolsTable.mcp_server_uuid,
      })
      .from(toolsTable)
      .innerJoin(
        mcpServersTable,
        eq(toolsTable.mcp_server_uuid, mcpServersTable.uuid)
      )
      .where(
        and(
          eq(toolsTable.mcp_server_uuid, serverUuid),
          eq(toolsTable.name, toolName),
          eq(mcpServersTable.profile_uuid, auth.activeProfile.uuid) // Ensure tool belongs to the user's profile
         )
      )
      // Define a basic type for the result array elements
      .then((results: Array<{ uuid: string | null; name: string | null; description: string | null; toolSchema: any; status: string | null; mcp_server_uuid: string | null }>) => results[0] || null);

    if (!tool) {
      return NextResponse.json(
        { error: 'Tool not found or not associated with this profile' },
        { status: 404 }
      );
    }

    return NextResponse.json({ tool });
  } catch (error) {
    console.error('Error fetching specific tool:', error);
    // Avoid leaking internal details in production
    return NextResponse.json(
      // Provide a generic error message to the client
      { error: 'Internal server error while fetching tool' }, 
      { status: 500 }
    );
  }
}
