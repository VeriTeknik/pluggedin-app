import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { customInstructionsTable,mcpServersTable, McpServerStatus } from '@/db/schema';
import { decryptServerData, encryptServerData } from '@/lib/encryption';

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
    
    // Fetch custom instructions for each server
    const serversWithInstructions = await Promise.all(
      activeMcpServers.map(async (server) => {
        // Decrypt sensitive fields
        const decryptedServer = decryptServerData(server);
        
        // Fetch custom instructions for this server
        const instructions = await db
          .select()
          .from(customInstructionsTable)
          .where(eq(customInstructionsTable.mcp_server_uuid, server.uuid))
          .limit(1);
        
        // Add custom instructions to server data if they exist
        if (instructions.length > 0 && instructions[0].messages) {
          return {
            ...decryptedServer,
            customInstructions: instructions[0].messages,
            customInstructionsDescription: instructions[0].description
          };
        }
        
        return decryptedServer;
      })
    );
    
    return NextResponse.json(serversWithInstructions);
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
    const { uuid, name, description, command, args, env, status, type, url } = body;

    // Encrypt sensitive fields
    const encryptedData = encryptServerData({
      command,
      args,
      env,
      url
    });

    const newMcpServer = await db
      .insert(mcpServersTable)
      .values({
        uuid,
        name,
        description,
        type,
        status,
        profile_uuid: auth.activeProfile.uuid,
        // Use encrypted fields
        command_encrypted: encryptedData.command_encrypted,
        args_encrypted: encryptedData.args_encrypted,
        env_encrypted: encryptedData.env_encrypted,
        url_encrypted: encryptedData.url_encrypted,
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
