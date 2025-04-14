import { and, asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server'; // External after internal

import { authenticateApiKey } from '@/app/api/auth'; // Internal first
import { db } from '@/db';
import { mcpServersTable, McpServerStatus, resourceTemplatesTable } from '@/db/schema';

// Define the type expected by MCP spec for ResourceTemplate
type McpResourceTemplate = {
  uriTemplate: string;
  name?: string;
  description?: string;
  mediaType?: string; // MCP SDK uses mediaType
  // template_variables are handled by the app/DB, not part of standard MCP response for list
};

export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/resource-templates:
 *   get:
 *     summary: Get discovered resource templates for the active profile
 *     description: |
 *       Retrieves a list of discovered resource templates associated with the authenticated user's active profile.
 *       Only templates linked to **active** MCP servers within that profile are included.
 *       The response is formatted to mimic the MCP ResourceTemplate list structure (`ListResourceTemplatesResult`) for compatibility with the pluggedin-mcp proxy.
 *       Requires API key authentication.
 *     tags:
 *       - Resource Templates
 *       - MCP Servers
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Successfully retrieved discovered resource templates, ordered by name.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   uriTemplate:
 *                     type: string
 *                     description: The URI template string.
 *                   name:
 *                     type: string
 *                     description: The name of the resource template.
 *                     nullable: true
 *                   description:
 *                     type: string
 *                     description: The description of the resource template.
 *                     nullable: true
 *                   mediaType:
 *                     type: string
 *                     description: The media type (MIME type) of the resource.
 *                     nullable: true
 *       401:
 *         description: Unauthorized - Invalid or missing API key or active profile not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Authorization header with Bearer token is required | Invalid API key | Active profile not found
 *       500:
 *         description: Internal Server Error fetching resource templates.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Internal Server Error fetching resource templates
 *                 details:
 *                   type: string
 */
export async function GET(request: Request) {
  try {
    // 1. Authenticate API Key and get active profile UUID
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;
    const profileUuid = auth.activeProfile.uuid;

    // 2. Query Resource Templates for Active Servers in the Active Profile
    const discoveredTemplates = await db
      .select({
        // Select fields matching the MCP ResourceTemplate type
        uriTemplate: resourceTemplatesTable.uri_template,
        name: resourceTemplatesTable.name,
        description: resourceTemplatesTable.description,
        mimeType: resourceTemplatesTable.mime_type, // Use mime_type from DB
        // Include server details if needed for debugging/logging
        // serverUuid: resourceTemplatesTable.mcp_server_uuid,
        // serverName: mcpServersTable.name,
      })
      .from(resourceTemplatesTable)
      .innerJoin(mcpServersTable, eq(resourceTemplatesTable.mcp_server_uuid, mcpServersTable.uuid))
      .where(
        and(
          eq(mcpServersTable.profile_uuid, profileUuid),
          eq(mcpServersTable.status, McpServerStatus.ACTIVE) // Only from active servers
        )
      )
      .orderBy(asc(resourceTemplatesTable.name)); // Optional: order results

    // 3. Format response according to MCP spec (ListResourceTemplatesResult)
    // Map DB results to the expected MCP ResourceTemplate structure
    const responsePayload: McpResourceTemplate[] = discoveredTemplates.map(t => ({
        uriTemplate: t.uriTemplate,
        name: t.name ?? undefined,
        description: t.description ?? undefined,
        mediaType: t.mimeType ?? undefined, // Map mime_type to mediaType
    }));

    // Return the array of templates. The proxy will wrap this in { resourceTemplates: [...] }
    return NextResponse.json(responsePayload);

  } catch (error) {
    console.error('[API /api/resource-templates Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error fetching resource templates', details: errorMessage }, { status: 500 });
  }
}
