import { and, eq } from 'drizzle-orm'; // External first
import { NextResponse } from 'next/server';

import { authenticateApiKey } from '@/app/api/auth'; // Then internal
import { db } from '@/db';
import { customInstructionsTable, mcpServersTable, McpServerStatus } from '@/db/schema'; // Use customInstructionsTable

// Define the type expected by MCP spec for Prompt (list version)
// We format custom instructions to match this structure for compatibility
type McpPromptListEntry = {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  _serverUuid?: string; // Include server UUID for potential client use
};

export const dynamic = 'force-dynamic';

/**
 * GET /api/custom-instructions
 * Retrieves a list of custom instructions for the profile associated
 * with the provided API key, formatted as MCP Prompt list entries.
 * Only instructions from active MCP servers are returned.
 * Expects 'Authorization: Bearer <API_KEY>' header.
 */
export async function GET(request: Request) {
  try {
    // 1. Authenticate API Key and get active profile UUID
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;
    const profileUuid = auth.activeProfile.uuid;

    // 2. Query Custom Instructions for Active Servers in the Active Profile
    const instructions = await db
      .select({
        // Select fields needed to format as McpPromptListEntry
        // Access columns via the table object
        uuid: customInstructionsTable.uuid, // Use uuid instead of id
        // name: customInstructionsTable.name, // 'name' column is commented out in schema
        description: customInstructionsTable.description,
        serverUuid: customInstructionsTable.mcp_server_uuid,
        serverName: mcpServersTable.name, // Get server name for prefixing
      })
      .from(customInstructionsTable)
      .innerJoin(mcpServersTable, eq(customInstructionsTable.mcp_server_uuid, mcpServersTable.uuid))
      .where(
        and(
          eq(mcpServersTable.profile_uuid, profileUuid),
          eq(mcpServersTable.status, McpServerStatus.ACTIVE) // Only from active servers
        )
      );
      // Removed orderBy(asc(customInstructionsTable.name)) as 'name' column doesn't exist

    // 3. Format response according to MCP spec (ListPromptsResult)
    // Map DB results (each object in 'instructions' array) to the McpPromptListEntry structure
    const responsePayload: McpPromptListEntry[] = instructions.map(instr => {
        // Access properties from the 'instr' object based on the keys defined in '.select()'
        const prefix = 'pluggedin_instruction';
        // Ensure serverName is treated as string before calling methods
        const serverPart = String(instr.serverName ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
        // Use a fixed string for the instruction part as 'name' column doesn't exist
        const instructionPart = 'default';
        const generatedName = `${prefix}_${serverPart}_${instructionPart}`;

        return {
            name: generatedName, // Use the generated name
            description: instr.description ?? undefined,
            arguments: [], // Custom instructions don't have arguments
            _serverUuid: instr.serverUuid, // Include server UUID from the selected data
        };
    });

    // Return the array of formatted instructions. The proxy will merge this.
    return NextResponse.json(responsePayload);

  } catch (error) {
    console.error('[API /api/custom-instructions Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error fetching custom instructions', details: errorMessage }, { status: 500 });
  }
}
