import { and, eq } from 'drizzle-orm'; // External first
import { NextResponse } from 'next/server';

import { authenticateApiKey } from '@/app/api/auth'; // Adjust path if needed
import { db } from '@/db';
import { mcpServersTable, McpServerStatus, promptsTable } from '@/db/schema'; // Removed customInstructionsTable import
import { decryptServerData } from '@/lib/encryption';

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
    // This resolver now ONLY handles standard prompts. Custom instructions are handled by the proxy directly.
    const serverDetailsResult = await db
      .select({
        serverUuid: mcpServersTable.uuid,
        serverName: mcpServersTable.name,
        serverType: mcpServersTable.type,
        serverCommand: mcpServersTable.command_encrypted,
        serverArgs: mcpServersTable.args_encrypted,
        serverEnv: mcpServersTable.env_encrypted,
        serverUrl: mcpServersTable.url_encrypted,
        })
        .from(promptsTable)
        .innerJoin(mcpServersTable, eq(promptsTable.mcp_server_uuid, mcpServersTable.uuid))
        .where(and(
          eq(mcpServersTable.profile_uuid, profileUuid),
          eq(promptsTable.name, promptName), // Matches the requested prompt name
          eq(mcpServersTable.status, McpServerStatus.ACTIVE) // Ensure server is active
        ))
        .limit(1);

    // 4. Check result and return server details or 404
    if (serverDetailsResult.length === 0) {
      return NextResponse.json({ error: `Prompt name not found or not associated with the active profile: ${promptName}` }, { status: 404 });
    }

    const serverDetails = serverDetailsResult[0];
    
    // Decrypt the server data
    const decryptedServer = decryptServerData({
      command_encrypted: serverDetails.serverCommand,
      args_encrypted: serverDetails.serverArgs,
      env_encrypted: serverDetails.serverEnv,
      url_encrypted: serverDetails.serverUrl
    }, profileUuid);
    
    return NextResponse.json({
        // Reconstruct a partial ServerParameters object for the proxy
        uuid: serverDetails.serverUuid,
        name: serverDetails.serverName,
        type: serverDetails.serverType,
        command: decryptedServer.command,
        args: decryptedServer.args,
        env: decryptedServer.env,
        url: decryptedServer.url,
    });

  } catch (error) {
    console.error('[API /api/resolve/prompt Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error resolving prompt name', details: errorMessage }, { status: 500 });
  }
}
