import { and, desc, eq, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import {
  codesTable,
  customMcpServersTable,
  McpServerStatus,
} from '@/db/schema';

import { authenticateApiKey } from '../auth';

/**
 * @swagger
 * /api/custom-mcp-servers:
 *   get:
 *     summary: Get custom MCP servers for the active profile
 *     description: Retrieves a list of all custom MCP servers (both ACTIVE and INACTIVE) associated with the authenticated user's active profile. Includes the associated code snippet if available. Requires API key authentication.
 *     tags:
 *       - Custom MCP Servers
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Successfully retrieved custom MCP servers, ordered by creation date descending.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   uuid:
 *                     type: string
 *                     format: uuid
 *                   name:
 *                     type: string
 *                   description:
 *                     type: string
 *                     nullable: true
 *                   code_uuid:
 *                     type: string
 *                     format: uuid
 *                     nullable: true
 *                   additionalArgs:
 *                     type: array
 *                     items:
 *                       type: string
 *                     nullable: true
 *                   env:
 *                     type: object
 *                     additionalProperties:
 *                       type: string
 *                     nullable: true
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *                   profile_uuid:
 *                     type: string
 *                     format: uuid
 *                   status:
 *                     $ref: '#/components/schemas/McpServerStatus' # Assuming McpServerStatus schema is defined
 *                   code:
 *                     type: string
 *                     description: The actual code snippet for the server.
 *                     nullable: true
 *                   codeFileName:
 *                     type: string
 *                     description: The filename associated with the code snippet.
 *                     nullable: true
 *       401:
 *         description: Unauthorized - Invalid or missing API key or active profile not found.
 *       500:
 *         description: Internal Server Error - Failed to fetch custom MCP servers.
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    const customMcpServers = await db
      .select({
        uuid: customMcpServersTable.uuid,
        name: customMcpServersTable.name,
        description: customMcpServersTable.description,
        code_uuid: customMcpServersTable.code_uuid,
        additionalArgs: customMcpServersTable.additionalArgs,
        env: customMcpServersTable.env,
        created_at: customMcpServersTable.created_at,
        profile_uuid: customMcpServersTable.profile_uuid,
        status: customMcpServersTable.status,
        code: codesTable.code,
        codeFileName: codesTable.fileName,
      })
      .from(customMcpServersTable)
      .leftJoin(
        codesTable,
        eq(customMcpServersTable.code_uuid, codesTable.uuid)
      )
      .where(
        and(
          eq(customMcpServersTable.profile_uuid, auth.activeProfile.uuid),
          or(
            eq(customMcpServersTable.status, McpServerStatus.ACTIVE),
            eq(customMcpServersTable.status, McpServerStatus.INACTIVE)
          )
        )
      )
      .orderBy(desc(customMcpServersTable.created_at));

    return NextResponse.json(customMcpServers);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to fetch custom MCP servers' },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/custom-mcp-servers:
 *   post:
 *     summary: Create a new custom MCP server
 *     description: Creates a new custom MCP server configuration associated with the authenticated user's active profile. Requires API key authentication.
 *     tags:
 *       - Custom MCP Servers
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
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name for the new custom server.
 *               description:
 *                 type: string
 *                 nullable: true
 *                 description: An optional description for the server.
 *               code_uuid:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: The UUID of the code snippet (from `codesTable`) to associate with this server.
 *               additionalArgs:
 *                 type: array
 *                 items:
 *                   type: string
 *                 nullable: true
 *                 description: Optional additional command-line arguments for the server process.
 *               env:
 *                 type: object
 *                 additionalProperties:
 *                   type: string
 *                 nullable: true
 *                 description: Optional environment variables for the server process.
 *     responses:
 *       200: # Changed from 201 to match implementation returning the object directly
 *         description: Successfully created the custom MCP server.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CustomMcpServer' # Assuming CustomMcpServer schema is defined
 *       400:
 *         description: Bad Request - Missing required fields (e.g., name).
 *       401:
 *         description: Unauthorized - Invalid or missing API key or active profile not found.
 *       500:
 *         description: Internal Server Error - Failed to create the custom MCP server.
 */
export async function POST(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const { name, description, code_uuid, additionalArgs, env } = body;

    const [newCustomMcpServer] = await db
      .insert(customMcpServersTable)
      .values({
        name,
        description,
        code_uuid,
        additionalArgs,
        env,
        status: McpServerStatus.ACTIVE,
        profile_uuid: auth.activeProfile.uuid,
      })
      .returning();

    return NextResponse.json(newCustomMcpServer);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to create custom MCP server' },
      { status: 500 }
    );
  }
}
