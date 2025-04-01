import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { authenticateApiKey } from '@/app/api/auth'; // Adjust path if needed
import { db } from '@/db';
import { mcpServersTable, resourcesTable } from '@/db/schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/resolve/resource?uri={encoded_uri}
 *
 * Finds the MCP server associated with a given resource URI for the active profile.
 * Used by the proxy to determine where to route `resources/read` requests.
 * Expects 'Authorization: Bearer <API_KEY>' header and 'uri' query parameter.
 */
export async function GET(request: Request) {
  try {
    // 1. Authenticate API Key and get active profile
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;
    const profileUuid = auth.activeProfile.uuid;

    // 2. Get URI from query parameters
    const { searchParams } = new URL(request.url);
    const uri = searchParams.get('uri');

    if (!uri) {
      return NextResponse.json({ error: 'Missing required query parameter: uri' }, { status: 400 });
    }

    // 3. Query the database to find the resource and its associated server
    const resourceAndServer = await db
      .select({
        // Select necessary server details for the proxy to establish a session
        serverUuid: mcpServersTable.uuid,
        serverName: mcpServersTable.name,
        serverType: mcpServersTable.type,
        serverCommand: mcpServersTable.command,
        serverArgs: mcpServersTable.args,
        serverEnv: mcpServersTable.env,
        serverUrl: mcpServersTable.url,
        // Include resource URI for confirmation if needed
        resourceUri: resourcesTable.uri,
      })
      .from(resourcesTable)
      .innerJoin(mcpServersTable, eq(resourcesTable.mcp_server_uuid, mcpServersTable.uuid))
      .where(and(
        eq(mcpServersTable.profile_uuid, profileUuid), // Belongs to the correct profile
        eq(resourcesTable.uri, uri) // Matches the requested URI
        // We might also want to check if the resource or server status is ACTIVE here
        // eq(resourcesTable.status, ToggleStatus.ACTIVE),
        // eq(mcpServersTable.status, McpServerStatus.ACTIVE)
      ))
      .limit(1); // Expect only one match per profile

    if (resourceAndServer.length === 0) {
      return NextResponse.json({ error: `Resource URI not found or not associated with the active profile: ${uri}` }, { status: 404 });
    }

    // 4. Return the server details needed by the proxy
    const serverDetails = resourceAndServer[0];
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
    console.error('[API /api/resolve/resource Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error resolving resource URI', details: errorMessage }, { status: 500 });
  }
}
