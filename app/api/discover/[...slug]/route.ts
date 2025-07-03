import { and, eq } from 'drizzle-orm'; // Sorted
import { NextResponse } from 'next/server'; // Sorted

import { discoverSingleServerTools } from '@/app/actions/discover-mcp-tools'; // Sorted
import { authenticateApiKey } from '@/app/api/auth'; // Sorted
import { db } from '@/db'; // Sorted
import { mcpServersTable,McpServerStatus } from '@/db/schema'; // Sorted

export const dynamic = 'force-dynamic';

// In-memory cache to track recent discovery attempts
const discoveryAttempts = new Map<string, number>();
const DISCOVERY_THROTTLE_MS = 2 * 60 * 1000; // 2 minutes for explicit discovery requests

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

    // 4. Apply throttling and trigger discovery action(s)
    const discoveryPromises: Promise<any>[] = [];
    const throttledServers: string[] = [];
    const now = Date.now();
    
    serversToDiscover.forEach(server => {
      const serverKey = `${profileUuid}:${server.uuid}`;
      const lastAttempt = discoveryAttempts.get(serverKey) || 0;
      
      // Check if discovery was attempted recently
      if ((now - lastAttempt) > DISCOVERY_THROTTLE_MS) {
        console.log(`[API Discover Trigger] Initiating discovery for server: ${server.name || server.uuid}`);
        
        // Record attempt to prevent duplicates
        discoveryAttempts.set(serverKey, now);
        
        // Call the action but don't await it here to keep the API response fast
        discoveryPromises.push(
          discoverSingleServerTools(profileUuid, server.uuid).catch(err => {
            console.error(`[API Discover] Discovery failed for ${server.uuid}:`, err);
            // Remove from cache on failure to allow retry sooner
            discoveryAttempts.delete(serverKey);
            return { error: err.message };
          })
        );
      } else {
        throttledServers.push(server.name || server.uuid);
        console.log(`[API Discover Trigger] Throttling discovery for server: ${server.name || server.uuid} (last attempt ${Math.round((now - lastAttempt) / 1000)}s ago)`);
      }
    });

    // Clean up old entries from discovery attempts cache
    const cutoff = now - DISCOVERY_THROTTLE_MS;
    for (const [key, timestamp] of discoveryAttempts.entries()) {
      if (timestamp < cutoff) {
        discoveryAttempts.delete(key);
      }
    }

    // Wait for all discovery actions to start (not necessarily finish)
    await Promise.allSettled(discoveryPromises);

    // 5. Return response with throttling information
    const targetDescription = discoverAll ? 'all active servers' : `server ${serversToDiscover[0]?.name || targetServerUuid}`;
    let message = `Discovery process initiated for ${targetDescription}.`;
    
    if (throttledServers.length > 0) {
      message += ` (${throttledServers.length} server(s) throttled: ${throttledServers.join(', ')})`;
    }
    
    message += ' Results will be available shortly.';
    
    return NextResponse.json({ message });

  } catch (error) {
    console.error('[API /api/discover Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error triggering discovery', details: errorMessage }, { status: 500 });
  }
}
