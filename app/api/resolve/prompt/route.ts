import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { authenticateApiKey } from '@/app/api/auth'; // Adjust path if needed
import { db } from '@/db';
import { mcpServersTable, promptsTable } from '@/db/schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/resolve/prompt?name={promptName}
 *
 * Finds the MCP server associated with a given prompt name for the active profile.
 * Used by the proxy to determine where to route `prompts/get` requests.
 * Expects 'Authorization: Bearer <API_KEY>' header and 'name' query parameter.
 */
export async function GET(request: Request) {
  try {
    // 1. Authenticate API Key and get active profile
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;
    const profileUuid = auth.activeProfile.uuid;

    // 2. Get prompt name from query parameters
    const { searchParams } = new URL(request.url);
    const promptName = searchParams.get('name');

    if (!promptName) {
      return NextResponse.json({ error: 'Missing required query parameter: name' }, { status: 400 });
    }

    // 3. Query the database to find the prompt and its associated server
    // Note: This assumes prompt names are unique across active servers for a profile.
    // If not, this logic might need refinement (e.g., require prefixed name).
    const promptAndServer = await db
      .select({
        // Select necessary server details for the proxy to establish a session
        serverUuid: mcpServersTable.uuid,
        serverName: mcpServersTable.name,
        serverType: mcpServersTable.type,
        serverCommand: mcpServersTable.command,
        serverArgs: mcpServersTable.args,
        serverEnv: mcpServersTable.env,
        serverUrl: mcpServersTable.url,
        // Include prompt name for confirmation if needed
        resolvedPromptName: promptsTable.name,
      })
      .from(promptsTable)
      .innerJoin(mcpServersTable, eq(promptsTable.mcp_server_uuid, mcpServersTable.uuid))
      .where(and(
        eq(mcpServersTable.profile_uuid, profileUuid), // Belongs to the correct profile
        eq(promptsTable.name, promptName) // Matches the requested prompt name
        // eq(mcpServersTable.status, McpServerStatus.ACTIVE) // Ensure server is active
      ))
      .limit(1); // Expect only one match per profile (requires unique prompt names or prefixed names)

    if (promptAndServer.length === 0) {
      return NextResponse.json({ error: `Prompt name not found or not associated with the active profile: ${promptName}` }, { status: 404 });
    }

    // 4. Return the server details needed by the proxy
    const serverDetails = promptAndServer[0];
    return NextResponse.json({
        // Reconstruct a partial ServerParameters object for the proxy
        uuid: serverDetails.serverUuid,
        name: serverDetails.serverName,
        type: serverDetails.serverType,
        command: serverDetails.serverCommand,
        args: serverDetails.serverArgs,
        env: serverDetails.serverEnv,
        url: serverDetails.serverUrl,
    });

  } catch (error) {
    console.error('[API /api/resolve/prompt Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error resolving prompt name', details: errorMessage }, { status: 500 });
  }
}
