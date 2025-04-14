import { and, eq } from 'drizzle-orm'; // Sorted
import { NextResponse } from 'next/server'; // Sorted

import { discoverSingleServerTools } from '@/app/actions/discover-mcp-tools'; // Sorted
import { authenticateApiKey } from '@/app/api/auth'; // Sorted
import { db } from '@/db'; // Sorted
import { mcpServersTable,McpServerStatus } from '@/db/schema'; // Sorted

export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/discover/{slug}:
 *   post:
 *     summary: Trigger MCP server discovery
 *     description: |
 *       Initiates the discovery process for tools, prompts, and resources for MCP servers associated with the authenticated user's active profile.
 *       Requires API key authentication. This endpoint is typically called by the `pluggedin_discover_tools` static tool within the pluggedin-mcp proxy.
 *
 *       The `slug` parameter determines the scope:
 *       - Use `all` (i.e., `/api/discover/all`) to trigger discovery for **all active** MCP servers in the profile.
 *       - Use a specific server UUID (i.e., `/api/discover/{server_uuid}`) to trigger discovery for **only that active** server.
 *
 *       The discovery process runs asynchronously in the background. This endpoint returns an immediate success response indicating the process has started.
 *     tags:
 *       - Discovery
 *       - MCP Servers
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Specifies the discovery target. Should be either the literal string `all` or a valid MCP server UUID.
 *         example: all OR 00000000-0000-0000-0000-000000000000
 *     responses:
 *       200:
 *         description: Discovery process successfully initiated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Discovery process initiated for all active servers. Results will be available shortly. | Discovery process initiated for server MyServerName. Results will be available shortly. | No active servers found for this profile to discover. | Server MyServerName is not active. Discovery skipped.
 *       400:
 *         description: Bad Request - Invalid discovery target in the slug.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Invalid discovery target. Use "/api/discover/all" or "/api/discover/{server_uuid}".
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
 *       404:
 *         description: Not Found - Specific server UUID provided in the slug was not found for the authenticated profile.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Server with UUID xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx not found for this profile.
 *       500:
 *         description: Internal Server Error - Failed to trigger the discovery process.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Internal Server Error triggering discovery
 *                 details:
 *                   type: string
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    // 1. Authenticate API Key and get active profile
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;
    const profileUuid = auth.activeProfile.uuid;

    // 2. Determine target (all or specific server)
    const { slug } = await params;
    const slugParam = slug ? slug.join('/') : null;
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
