import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { mcpServersTable, McpServerStatus } from '@/db/schema';
import { decryptServerData } from '@/lib/encryption';

import { authenticateApiKey } from '../auth';

/**
 * @swagger
 * /api/mcp-servers:
 *   get:
 *     summary: Get active MCP servers for the active profile
 *     description: Retrieves a list of all MCP servers marked as ACTIVE for the authenticated user's currently active profile. Requires API key authentication. This is used by the pluggedin-mcp proxy to know which downstream servers to connect to.
 *     tags:
 *       - MCP Servers
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Successfully retrieved active MCP servers.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/McpServer' # Assuming McpServer schema is defined
 *       401:
 *         description: Unauthorized - Invalid or missing API key or profile.
 *       500:
 *         description: Internal Server Error.
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    const activeMcpServers = await db
      .select()
      .from(mcpServersTable)
      .where(
        and(
          eq(mcpServersTable.status, McpServerStatus.ACTIVE),
          eq(mcpServersTable.profile_uuid, auth.activeProfile.uuid)
        )
      );
    
    // Decrypt sensitive fields before sending to MCP proxy
    const decryptedServers = activeMcpServers.map(server => 
      decryptServerData(server, auth.activeProfile.uuid)
    );
    
    return NextResponse.json(decryptedServers);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to fetch active MCP servers' },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/mcp-servers:
 *   post:
 *     summary: Create a new MCP server configuration (Internal/Manual Use)
 *     description: Creates a new MCP server configuration record associated with the authenticated user's active profile. Note This endpoint might be primarily for internal use or manual setup rather than direct user interaction via the API. Requires API key authentication.
 *     tags:
 *       - MCP Servers
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - uuid
 *               - name
 *               - status
 *             properties:
 *               uuid:
 *                 type: string
 *                 format: uuid
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *                 nullable: true
 *               command:
 *                 type: string
 *                 nullable: true
 *               args:
 *                 type: array
 *                 items:
 *                   type: string
 *                 nullable: true
 *               env:
 *                 type: object
 *                 additionalProperties:
 *                   type: string
 *                 nullable: true
 *               status:
 *                 $ref: '#/components/schemas/McpServerStatus' # Assuming McpServerStatus is defined
 *     responses:
 *       200:
 *         description: Successfully created the MCP server configuration.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/McpServer' # Assuming McpServer schema is defined
 *       401:
 *         description: Unauthorized - Invalid or missing API key or profile.
 *       500:
 *         description: Internal Server Error - Failed to create the record.
 */
export async function POST(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const { uuid, name, description, command, args, env, status } = body;

    const newMcpServer = await db
      .insert(mcpServersTable)
      .values({
        uuid,
        name,
        description,
        command,
        args,
        env,
        status,
        profile_uuid: auth.activeProfile.uuid,
      })
      .returning();

    return NextResponse.json(newMcpServer[0]);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to create MCP server' },
      { status: 500 }
    );
  }
}
