import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { customInstructionsTable,mcpServerOAuthTokensTable, mcpServersTable, McpServerStatus, McpServerType } from '@/db/schema';
import { decryptServerData, encryptServerData } from '@/lib/encryption';
import { validateAndRefreshToken } from '@/lib/oauth/token-refresh-service';
import { validateCommand, validateCommandArgs, validateMcpUrl } from '@/lib/security/validators';

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

    // P0 Performance: Batch fetch all OAuth tokens to prevent N+1 query problem
    const allOAuthTokens = serverUuids.length > 0
      ? await db
          .select()
          .from(mcpServerOAuthTokensTable)
          .where(inArray(mcpServerOAuthTokensTable.server_uuid, serverUuids))
      : [];

    // Create a Set of server UUIDs that have OAuth tokens for O(1) lookups
    const serversWithOAuth = new Set(allOAuthTokens.map(token => token.server_uuid));

    // Check and refresh OAuth tokens for servers that have them
    for (const server of activeMcpServers) {
      // Check if server has OAuth tokens using the pre-fetched set
      const hasOAuth = serversWithOAuth.has(server.uuid);

      if (hasOAuth) {
        // Validate and refresh token if needed (P0 Security: includes ownership validation)
        const refreshed = await validateAndRefreshToken(server.uuid, auth.user.id);
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
 *     description: Creates a new MCP server configuration record associated with the authenticated user's active profile. Note This endpoint might be primarily for internal use or manual setup rather than direct user interaction via the API. Requires API key authentication. The server's uuid is assigned by the server and returned in the response; a uuid in the request body is ignored.
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
 *               - name
 *               - status
 *             properties:
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
    // No uuid from the body: it names the server's directory in the package
    // store, which outlives the row, so the database assigns it.
    const { name, description, command, args, env, status, type, url } = body;

    // The same rules the createMcpServer action applies: a known transport, an
    // allowlisted command for STDIO, a validated URL for a remote server — and
    // no process fields on a remote server, which runs nothing locally.
    const serverType: McpServerType = type ?? McpServerType.STDIO;
    if (!Object.values(McpServerType).includes(serverType)) {
      return NextResponse.json({ error: 'Unsupported server type' }, { status: 400 });
    }
    const isStdio = serverType === McpServerType.STDIO;
    const checks = isStdio
      ? [command != null ? validateCommand(command) : null, args != null ? validateCommandArgs(args) : null]
      : [url != null ? validateMcpUrl(url) : null];
    const failed = checks.find((check) => check && !check.valid);
    if (failed) {
      return NextResponse.json({ error: failed.error || 'Invalid server configuration' }, { status: 400 });
    }

    // Encrypt sensitive fields
    const encryptedData = encryptServerData({
      command: isStdio ? command : null,
      args: isStdio ? args : [],
      env,
      url
    });

    const newMcpServer = await db
      .insert(mcpServersTable)
      .values({
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
