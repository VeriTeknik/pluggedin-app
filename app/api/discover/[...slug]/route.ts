import { and, eq } from 'drizzle-orm'; // Sorted
import { NextResponse } from 'next/server'; // Sorted

import { discoverSingleServerTools } from '@/app/actions/discover-mcp-tools'; // Sorted
import { authenticateApiKey } from '@/app/api/auth'; // Sorted
import { db } from '@/db'; // Sorted
import { McpServerStatus, mcpServersTable } from '@/db/schema'; // Sorted

export const dynamic = 'force-dynamic';

/**
 * POST /api/discover/all
 * POST /api/discover/{server_uuid}
 *
 * Triggers the discovery action for MCP servers associated with the API key's profile.
 * Called by the `pluggedin_discover_tools` static tool in the proxy.
 * Expects 'Authorization: Bearer <API_KEY>' header.
 */
export async function POST(
  request: Request,
  { params }: { params: { slug: string[] } }
) {
  try {
    // 1. Authenticate API Key and get active profile
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;
    const profileUuid = auth.activeProfile.uuid;

    // 2. Determine target (all or specific server)
    const slugParam = params.slug ? params.slug.join('/') : null;
    let targetServerUuid: string | null = null;
    let discoverAll = false;

    if (slugParam === 'all') {
      discoverAll = true;
    } else if (slugParam && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(slugParam)) {
      // Basic UUID format check
      targetServerUuid = slugParam;
    } else {
      return NextResponse.json({ error: 'Invalid discovery target. Use "/api/discover/all" or "/api/discover/{server_uuid}".' }, { status: 400 });
    }

    // 3. Fetch target server(s)
    let serversToDiscover: { uuid: string; name: string | null }[] = [];
    if (discoverAll) {
      serversToDiscover = await db
        .select({ uuid: mcpServersTable.uuid, name: mcpServersTable.name })
        .from(mcpServersTable)
        .where(and(
          eq(mcpServersTable.profile_uuid, profileUuid),
          eq(mcpServersTable.status, McpServerStatus.ACTIVE) // Only discover active servers
        ));
      if (serversToDiscover.length === 0) {
         return NextResponse.json({ message: 'No active servers found for this profile to discover.' });
      }
    } else if (targetServerUuid) {
      const specificServer = await db.query.mcpServersTable.findFirst({
        where: and(
          eq(mcpServersTable.uuid, targetServerUuid),
          eq(mcpServersTable.profile_uuid, profileUuid) // Ensure it belongs to the profile
        ),
        columns: { uuid: true, name: true, status: true },
      });
      if (!specificServer) {
        return NextResponse.json({ error: `Server with UUID ${targetServerUuid} not found for this profile.` }, { status: 404 });
      }
       if (specificServer.status !== McpServerStatus.ACTIVE) {
         return NextResponse.json({ message: `Server ${specificServer.name || targetServerUuid} is not active. Discovery skipped.` });
       }
      serversToDiscover.push({ uuid: specificServer.uuid, name: specificServer.name });
    }

    // 4. Trigger discovery action(s) - asynchronously without waiting
    const discoveryPromises: Promise<any>[] = []; // Changed let to const
    serversToDiscover.forEach(server => {
      console.log(`[API Discover Trigger] Initiating discovery for server: ${server.name || server.uuid}`);
      // Call the action but don't await it here to keep the API response fast
      discoveryPromises.push(discoverSingleServerTools(profileUuid, server.uuid));
      // We could potentially handle errors here later if needed, maybe logging them
    });

    // Wait for all discovery actions to start (not necessarily finish)
    // This is a basic fire-and-forget approach for the API response.
    // A more robust solution might involve background jobs or status polling.
    await Promise.allSettled(discoveryPromises); // Wait briefly for promises to initiate

    // 5. Return immediate success response
    const targetDescription = discoverAll ? 'all active servers' : `server ${serversToDiscover[0]?.name || targetServerUuid}`;
    return NextResponse.json({ message: `Discovery process initiated for ${targetDescription}. Results will be available shortly.` });

  } catch (error) {
    console.error('[API /api/discover Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error triggering discovery', details: errorMessage }, { status: 500 });
  }
}
