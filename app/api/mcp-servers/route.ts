import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { customInstructionsTable,mcpServersTable, mcpServerOAuthTokensTable, McpServerStatus } from '@/db/schema';
import { decryptServerData, encryptServerData } from '@/lib/encryption';
import { validateAndRefreshToken } from '@/lib/oauth/token-refresh-service';

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
    
    // Batch fetch all custom instructions for these servers in a single query
    const serverUuids = activeMcpServers.map(s => s.uuid);
    const allInstructions = serverUuids.length > 0 
      ? await db
          .select()
          .from(customInstructionsTable)
          .where(inArray(customInstructionsTable.mcp_server_uuid, serverUuids))
      : [];
    
    // Create a Map for O(1) lookups of instructions by server UUID
    const instructionsMap = new Map(
      allInstructions.map(inst => [inst.mcp_server_uuid, inst])
    );

    // Check and refresh OAuth tokens for servers that have them
    for (const server of activeMcpServers) {
      // Check if server has OAuth tokens
      const hasOAuth = await db.query.mcpServerOAuthTokensTable.findFirst({
        where: eq(mcpServerOAuthTokensTable.mcp_server_uuid, server.uuid)
      });

      if (hasOAuth) {
        // Validate and refresh token if needed
        const refreshed = await validateAndRefreshToken(server.uuid);
        if (refreshed) {
          console.log(`[OAuth] Token validated/refreshed for server: ${server.name || server.uuid}`);
          // Re-fetch the server to get updated streamable_http_options
          const updatedServer = await db
            .select()
            .from(mcpServersTable)
            .where(eq(mcpServersTable.uuid, server.uuid))
            .then(rows => rows[0]);
          if (updatedServer) {
            // Replace server in array with updated version
            const index = activeMcpServers.findIndex(s => s.uuid === server.uuid);
            if (index !== -1) {
              activeMcpServers[index] = updatedServer;
            }
          }
        }
      }
    }

    // Map servers with their instructions (synchronous, no async needed)
    const serversWithInstructions = activeMcpServers.map(server => {
      const decryptedServer = decryptServerData(server);
      const instructions = instructionsMap.get(server.uuid);
      
      // Add custom instructions if they exist
      if (instructions?.messages) {
        return {
          ...decryptedServer,
          customInstructions: instructions.messages,
          customInstructionsDescription: instructions.description
        };
      }
      
      return decryptedServer;
    });
    
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
