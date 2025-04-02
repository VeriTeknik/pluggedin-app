import { and, asc, eq } from 'drizzle-orm'; // Then external
import { NextResponse } from 'next/server'; // External first

import { authenticateApiKey } from '@/app/api/auth'; // Then internal
import { db } from '@/db';
import { mcpServersTable, McpServerStatus, promptsTable } from '@/db/schema';
// Define the type expected by MCP spec for Prompt (list version)
// Based on promptsTable schema and MCP spec
type McpPromptListEntry = {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
};

export const dynamic = 'force-dynamic';

/**
 * GET /api/prompts
 * Retrieves a list of discovered prompts for the profile associated
 * with the provided API key. Only prompts from active MCP servers are returned.
 * Expects 'Authorization: Bearer <API_KEY>' header.
 */
export async function GET(request: Request) {
  try {
    // 1. Authenticate API Key and get active profile UUID
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;
    const profileUuid = auth.activeProfile.uuid;

    // 2. Query Prompts for Active Servers in the Active Profile
    const discoveredPrompts = await db
      .select({
        // Select fields matching the MCP Prompt type (for list view)
        name: promptsTable.name,
        description: promptsTable.description,
        argumentsSchema: promptsTable.arguments_schema, // Get the stored schema
        // Include server details if needed for debugging/logging or prefixing
        serverUuid: promptsTable.mcp_server_uuid,
        serverName: mcpServersTable.name,
      })
      .from(promptsTable)
      .innerJoin(mcpServersTable, eq(promptsTable.mcp_server_uuid, mcpServersTable.uuid))
      .where(
        and(
          eq(mcpServersTable.profile_uuid, profileUuid),
          eq(mcpServersTable.status, McpServerStatus.ACTIVE) // Only from active servers
        )
      )
      .orderBy(asc(promptsTable.name)); // Optional: order results

    // 3. Format response according to MCP spec (ListPromptsResult)
    // Map DB results to the expected MCP Prompt structure for listing
    const responsePayload: McpPromptListEntry[] = discoveredPrompts.map(p => ({
        name: p.name, // We might add prefixing here later if needed
        description: p.description ?? undefined,
        arguments: p.argumentsSchema ?? [], // Use the stored schema
    }));

    // Return the array of prompts. The proxy will wrap this in { prompts: [...] }
    return NextResponse.json(responsePayload);

  } catch (error) {
    console.error('[API /api/prompts Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error fetching prompts', details: errorMessage }, { status: 500 });
  }
}
