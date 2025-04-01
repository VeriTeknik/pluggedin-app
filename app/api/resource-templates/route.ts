import { and, asc, eq } from 'drizzle-orm'; // Removed unused InferSelectModel
import { NextResponse } from 'next/server';

import { authenticateApiKey } from '@/app/api/auth';
import { db } from '@/db';
// Removed unused projectsTable import
import { McpServerStatus, mcpServersTable, resourceTemplatesTable } from '@/db/schema';

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
 * GET /api/resource-templates
 * Retrieves a list of discovered resource templates for the profile associated
 * with the provided API key. Only templates from active MCP servers are returned.
 * Expects 'Authorization: Bearer <API_KEY>' header.
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
