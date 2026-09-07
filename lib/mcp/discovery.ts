import 'server-only';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

// import { revalidatePath } from 'next/cache';
import { db } from '@/db';
// Import promptsTable and Prompt type
import { mcpServersTable, ToggleStatus, toolsTable } from '@/db/schema'; // Sorted
import { decryptServerData } from '@/lib/encryption';
import { listPromptsFromServer, listResourcesFromServer, listToolsFromServer } from '@/lib/mcp/client-wrapper'; // Sorted
import { categorizeError, mcpCapabilitiesDiscovered, mcpDiscoveryDuration, mcpDiscoveryFailures } from '@/lib/mcp/metrics';
import { McpServer } from '@/types/mcp-server';
// Removed getUserData import
// import { convertMcpToLangchainTools, McpServersConfig } from '@h1deya/langchain-mcp-tools';
// Removed direct SDK type import

// UUID validation schema
const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Helper: Validate UUIDs to prevent SQL injection
 */
function validateUuids(profileUuid: string, serverUuid: string) {
  uuidSchema.parse(profileUuid);
  uuidSchema.parse(serverUuid);
}

/**
 * Helper: Fetch server record from database
 */
async function fetchServerRecord(profileUuid: string, serverUuid: string) {
  const record = await db.query.mcpServersTable.findFirst({
    where: and(
      eq(mcpServersTable.uuid, serverUuid),
      eq(mcpServersTable.profile_uuid, profileUuid)
    ),
  });

  if (!record) {
    throw new Error(`MCP Server with UUID ${serverUuid} not found for profile ${profileUuid}.`);
  }

  return record;
}

/**
 * Helper: Transform database record to McpServer format
 */
function toMcpServer(record: any): McpServer {
  const decrypted = decryptServerData(record);
  return {
    ...decrypted,
    config: decrypted.config as Record<string, any> | null,
    transport: decrypted.transport as 'streamable_http' | 'sse' | 'stdio' | undefined
  };
}

/**
 * Helper: Discover tools with timeout and save to database
 */
async function discoverAndSaveTools(
  mcpServer: McpServer,
  serverUuid: string
): Promise<{ tools: any[]; error?: string }> {
  let tools: any[] = [];
  let error: string | undefined;
  const startTime = Date.now();
  const transport = mcpServer.transport || (mcpServer.type === 'STREAMABLE_HTTP' ? 'streamable_http' : mcpServer.type === 'SSE' ? 'sse' : 'stdio');

  try {
    // Discover tools with 15-second timeout
    tools = await Promise.race([
      listToolsFromServer(mcpServer),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Discovery timeout after 15 seconds')), 15000)
      )
    ]);

    // Save to database in transaction
    await db.transaction(async (tx) => {
      await tx.delete(toolsTable).where(eq(toolsTable.mcp_server_uuid, serverUuid));

      if (tools.length > 0) {
        await tx.insert(toolsTable).values(
          tools.map(tool => ({
            mcp_server_uuid: serverUuid,
            name: tool.name,
            description: tool.description,
            toolSchema: tool.inputSchema as any,
            status: ToggleStatus.ACTIVE,
          }))
        );
      }
    });

    // Track successful discovery
    const durationMs = Date.now() - startTime;
    mcpDiscoveryDuration.observe({ operation: 'tools', transport, status: 'success' }, durationMs / 1000);
    if (tools.length > 0) {
      mcpCapabilitiesDiscovered.inc({ type: 'tool', server_type: mcpServer.type || 'unknown', transport }, tools.length);
    }

    console.log('[MCP Discovery]', {
      operation: 'tools',
      serverName: mcpServer.name,
      serverUuid,
      transport,
      count: tools.length,
      durationMs,
      status: 'success',
      timestamp: new Date().toISOString()
    });

  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const isAbortError = err?.code === 20 ||
                        err?.name === 'AbortError' ||
                        err?.message?.includes('abort');
    const isTimeoutError = err?.message?.includes('timeout');

    let errorType: string;
    if (isAbortError) {
      console.warn(`[Tool Discovery][WARN] AbortError for ${mcpServer.name}: ${err?.message || err}`);
      error = 'Discovery aborted';
      errorType = 'abort';
    } else if (isTimeoutError) {
      console.error(`[Tool Discovery][ERROR] Timeout after 15s for ${mcpServer.name}: ${err?.message || err}`);
      error = 'Discovery timeout';
      errorType = 'timeout';
    } else {
      console.error('[Tool Discovery][ERROR] Unknown failure during discovery:', err);
      error = err?.message || 'Unknown error during tool discovery';
      errorType = categorizeError(err);
    }

    // Track failed discovery
    mcpDiscoveryDuration.observe({ operation: 'tools', transport, status: 'error' }, durationMs / 1000);
    mcpDiscoveryFailures.inc({ operation: 'tools', transport, error_type: errorType });

    console.log('[MCP Discovery Failed]', {
      operation: 'tools',
      serverName: mcpServer.name,
      serverUuid,
      transport,
      errorType,
      durationMs,
      status: 'error',
      timestamp: new Date().toISOString()
    });
  }

  return { tools, error };
}

/**
 * Internal discovery function (no auth required) for system-initiated discovery
 *
 * ⚠️ SECURITY WARNING:
 * This function bypasses authentication and should ONLY be called from trusted
 * internal contexts where the profileUuid and user ownership are already validated
 * (e.g., API routes after authenticateApiKey(), during user signup, system maintenance).
 *
 * ✅ USE THIS FUNCTION for:
 * - API routes that have already authenticated with authenticateApiKey()
 * - Internal system processes (signup, sample server installation)
 * - Background tasks where authentication was performed upstream
 *
 * ❌ DO NOT USE for:
 * - Direct client-initiated actions without authentication
 * - Exposed endpoints without prior authentication
 *
 * Use discoverSingleServerTools() for user-initiated actions from the web UI
 * where NextAuth session-based authentication is required.
 *
 * @param profileUuid The UUID of the profile the server belongs to.
 * @param serverUuid The UUID of the MCP server to discover tools for.
 * @returns An object indicating success or failure with a message.
 */
export async function discoverSingleServerToolsInternal(
    profileUuid: string,
    serverUuid: string
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    // Step 1: Validate inputs
    validateUuids(profileUuid, serverUuid);

    // Step 2: Fetch and transform server configuration
    const serverRecord = await fetchServerRecord(profileUuid, serverUuid);
    const mcpServer = toMcpServer(serverRecord);

    // Step 3: Discover tools and save to database
    const { tools, error } = await discoverAndSaveTools(mcpServer, serverUuid);

    // Step 4: Build response
    const success = !error || tools.length > 0;
    const message = success
      ? `✅ Auto-discovery succeeded for ${serverRecord.name}: Successfully discovered ${tools.length} tools.`
      : `⚠️ Auto-discovery completed with errors for ${serverRecord.name}.`;

    return { success, message, error: success ? undefined : error };

  } catch (error: any) {
    const isValidationError = error instanceof z.ZodError;
    const message = isValidationError
      ? 'Invalid UUID format provided.'
      : `Failed to discover tools for server ${serverUuid}.`;

    console.error('[Discovery Internal] Error:', { serverUuid, error });
    return { success: false, message, error: error.message };
  }
}
