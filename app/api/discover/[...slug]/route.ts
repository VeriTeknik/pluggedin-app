import { and, eq } from 'drizzle-orm'; // Sorted
import { NextResponse } from 'next/server'; // Sorted

import { discoverSingleServerToolsInternal } from '@/app/actions/discover-mcp-tools'; // Sorted
import { authenticateApiKey } from '@/app/api/auth'; // Sorted
import { db } from '@/db'; // Sorted
import { mcpServersTable,McpServerStatus } from '@/db/schema'; // Sorted
import { RateLimiters } from '@/lib/rate-limiter'; // Sorted

export const dynamic = 'force-dynamic';

// In-memory cache to track recent discovery attempts
const discoveryAttempts = new Map<string, number>();
const DISCOVERY_THROTTLE_MS = 2 * 60 * 1000; // 2 minutes for explicit discovery requests

/**
 * Request body type for discovery endpoint
 */
interface DiscoverRequestBody {
  force_refresh?: boolean;
}

/**
 * Helper to safely parse JSON from request, returning fallback on error
 */
async function safeJson<T>(req: Request, fallback: T): Promise<T> {
  try {
    return await req.json();
  } catch {
    return fallback;
  }
}

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
 *     requestBody:
 *       description: Optional request body to control discovery behavior
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               force_refresh:
 *                 type: boolean
 *                 description: |
 *                   Bypass throttling to force immediate discovery.
 *                   Rate limited to 10 requests per hour to prevent abuse.
 *                   When false or omitted, normal 2-minute throttling applies.
 *                 default: false
 *                 example: true
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
 *       429:
 *         description: Too Many Requests - Force refresh rate limit exceeded (10 requests per hour).
 *         headers:
 *           X-RateLimit-Limit:
 *             schema:
 *               type: integer
 *             description: Maximum number of requests allowed in the time window
 *           X-RateLimit-Remaining:
 *             schema:
 *               type: integer
 *             description: Number of requests remaining (always 0 for 429 response)
 *           X-RateLimit-Reset:
 *             schema:
 *               type: string
 *               format: date-time
 *             description: ISO 8601 timestamp when the rate limit resets
 *           Retry-After:
 *             schema:
 *               type: integer
 *             description: Seconds until rate limit resets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Rate limit exceeded for force refresh operations
 *                 limit:
 *                   type: integer
 *                   example: 10
 *                 remaining:
 *                   type: integer
 *                   example: 0
 *                 reset:
 *                   type: string
 *                   format: date-time
 *                   example: "2025-01-26T01:34:59.000Z"
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
    // ============================================================================
    // SECURITY: Authentication & Authorization
    // ============================================================================
    // 1. This endpoint requires API key authentication (Bearer token)
    // 2. The authenticateApiKey() function validates the API key and retrieves
    //    the user's active profile, ensuring only authenticated users can access
    // 3. All servers are filtered by profileUuid, ensuring users can only discover
    //    servers they own (authorization enforced by database query)
    // 4. discoverSingleServerToolsInternal() is safe to use here because:
    //    - Authentication already performed via authenticateApiKey()
    //    - Server ownership verified via profileUuid filter
    //    - This is a trusted internal context after auth validation
    // ============================================================================

    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;
    const profileUuid = auth.activeProfile.uuid;

    // Parse request body to get force_refresh parameter
    const { force_refresh: forceRefresh = false } = await safeJson<DiscoverRequestBody>(
      request,
      { force_refresh: false }
    );

    // Rate limit force_refresh operations to prevent abuse
    if (forceRefresh) {
      const rateLimitResult = await RateLimiters.forceRefresh(request as any);
      if (!rateLimitResult.allowed) {
        const resetDate = new Date(rateLimitResult.reset);
        const retryAfter = Math.ceil((rateLimitResult.reset - Date.now()) / 1000);

        return NextResponse.json(
          {
            error: 'Rate limit exceeded for force refresh operations',
            limit: rateLimitResult.limit,
            remaining: rateLimitResult.remaining,
            reset: resetDate.toISOString()
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': rateLimitResult.limit.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': resetDate.toISOString(),
              'Retry-After': retryAfter.toString()
            }
          }
        );
      }
    }

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
    const now = Date.now();
    const discoveryPromises: Promise<any>[] = [];
    const throttledServers: string[] = [];

    for (const { uuid, name } of serversToDiscover) {
      const key = `${profileUuid}:${uuid}`;
      const last = discoveryAttempts.get(key) || 0;
      const isThrottled = !forceRefresh && (now - last) <= DISCOVERY_THROTTLE_MS;

      if (isThrottled) {
        throttledServers.push(name || uuid);
        continue;
      }

      // Record attempt timestamp only for normal discoveries (not forced)
      if (!forceRefresh) {
        discoveryAttempts.set(key, now);
      }

      // Trigger discovery asynchronously
      discoveryPromises.push(
        discoverSingleServerToolsInternal(profileUuid, uuid).catch(err => {
          console.error(`[API Discover] Discovery failed for ${uuid}:`, err);
          // Remove from cache on failure to allow retry sooner (only if we recorded it)
          if (!forceRefresh) {
            discoveryAttempts.delete(key);
          }
          return { error: err.message };
        })
      );
    }

    // Clean up old entries from discovery attempts cache
    const cutoff = now - DISCOVERY_THROTTLE_MS;
    for (const key of discoveryAttempts.keys()) {
      if ((discoveryAttempts.get(key) ?? 0) < cutoff) {
        discoveryAttempts.delete(key);
      }
    }

    // Wait for all discovery actions to start (not necessarily finish)
    await Promise.allSettled(discoveryPromises);

    // 5. Build response message
    const targetDesc = discoverAll
      ? 'all active servers'
      : `server ${serversToDiscover[0]?.name || targetServerUuid}`;

    const baseMsg = forceRefresh
      ? `🔄 Force refresh: Discovery initiated for ${targetDesc} (throttling bypassed).`
      : `Discovery process initiated for ${targetDesc}.`;

    const throttleMsg = throttledServers.length
      ? ` (${throttledServers.length} throttled: ${throttledServers.join(', ')})`
      : '';

    return NextResponse.json({
      message: `${baseMsg}${throttleMsg} Results will be available shortly.`,
    });

  } catch (error) {
    console.error('[API /api/discover Error]', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error triggering discovery', details: errorMessage }, { status: 500 });
  }
}
