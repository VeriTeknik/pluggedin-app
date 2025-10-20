'use server';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

// import { revalidatePath } from 'next/cache';
import { db } from '@/db';
// Import promptsTable and Prompt type
import { mcpServersTable, profilesTable, promptsTable, resourcesTable, resourceTemplatesTable, ToggleStatus, toolsTable } from '@/db/schema'; // Sorted
import { withAuth } from '@/lib/auth-helpers';
import { decryptServerData } from '@/lib/encryption';
import { listPromptsFromServer, listResourcesFromServer, listResourceTemplatesFromServer, listToolsFromServer } from '@/lib/mcp/client-wrapper'; // Sorted
import { McpServer } from '@/types/mcp-server';
// Removed getUserData import
// import { convertMcpToLangchainTools, McpServersConfig } from '@h1deya/langchain-mcp-tools';
// Removed direct SDK type import

// UUID validation schema
const uuidSchema = z.string().uuid('Invalid UUID format');

// Infer Resource type
type ResourcesArray = Awaited<ReturnType<typeof listResourcesFromServer>>;
type InferredResource = ResourcesArray[number];
// Infer Prompt type
type PromptsArray = Awaited<ReturnType<typeof listPromptsFromServer>>;
type InferredPrompt = PromptsArray[number];

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
  } catch (err: any) {
    const isAbortError = err?.code === 20 ||
                        err?.name === 'AbortError' ||
                        err?.message?.includes('abort');
    const isTimeoutError = err?.message?.includes('timeout');

    if (isAbortError) {
      console.warn(`[Tool Discovery][WARN] AbortError for ${mcpServer.name}: ${err?.message || err}`);
      error = 'Discovery aborted';
    } else if (isTimeoutError) {
      console.error(`[Tool Discovery][ERROR] Timeout after 15s for ${mcpServer.name}: ${err?.message || err}`);
      error = 'Discovery timeout';
    } else {
      console.error('[Tool Discovery][ERROR] Unknown failure during discovery:', err);
      error = err?.message || 'Unknown error during tool discovery';
    }
  }

  return { tools, error };
}

/**
 * Internal discovery function (no auth required) for system-initiated discovery
 *
 * ⚠️ SECURITY WARNING:
 * This function bypasses authentication and should ONLY be called from trusted
 * internal contexts where the profileUuid is already validated (e.g., during
 * user signup, system maintenance tasks).
 *
 * DO NOT expose this function to API routes or user-initiated actions.
 * Use discoverSingleServerTools() for user-initiated discovery operations.
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

/**
 * Discovers tools for a single MCP server and updates the database.
 * Requires authentication and verifies profile ownership.
 * @param profileUuid The UUID of the profile the server belongs to.
 * @param serverUuid The UUID of the MCP server to discover tools for.
 * @returns An object indicating success or failure with a message.
 */
export async function discoverSingleServerTools(
    profileUuid: string,
    serverUuid: string
): Promise<{ success: boolean; message: string; error?: string }> {
  // Authenticate user and verify profile ownership
  const authResult = await withAuth(async (session) => {
    // Get profile with its associated project
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.uuid, profileUuid),
      with: {
        project: true
      }
    });

    if (!profile) {
      return { success: false, message: 'Profile not found.' };
    }

    // Verify the project belongs to the authenticated user
    if (profile.project.user_id !== session.user.id) {
      return { success: false, message: 'Access denied. Profile does not belong to your account.' };
    }

    return { success: true, userId: session.user.id };
  });

  if (!authResult.success) {
    return { success: false, message: authResult.message || 'Authentication required.' };
  }

  if (!profileUuid || !serverUuid) {
      return { success: false, message: 'Profile UUID and Server UUID are required.' };
  }

  try {
    // 1. Fetch the specific MCP server configuration from the database using both UUIDs
    const serverConfig = await db.query.mcpServersTable.findFirst({
      where: and(
        eq(mcpServersTable.uuid, serverUuid),
        eq(mcpServersTable.profile_uuid, profileUuid)
      ),
    });

    if (!serverConfig) {
      throw new Error(`MCP Server with UUID ${serverUuid} not found for the active profile.`);
    }

    // Decrypt the server configuration
    const decryptedServerConfig = decryptServerData(serverConfig);
    const discoveryServerConfig: McpServer = {
        ...decryptedServerConfig,
        config: decryptedServerConfig.config as Record<string, any> | null,
        transport: decryptedServerConfig.transport as 'streamable_http' | 'sse' | 'stdio' | undefined
    };

    let discoveredTools: Awaited<ReturnType<typeof listToolsFromServer>> = [];
    let discoveredTemplates: Awaited<ReturnType<typeof listResourceTemplatesFromServer>> = [];
    let discoveredResources: Awaited<ReturnType<typeof listResourcesFromServer>> = [];
    let discoveredPrompts: Awaited<ReturnType<typeof listPromptsFromServer>> = []; // Added
    let toolError: string | null = null;
    let templateError: string | null = null;
    let resourceError: string | null = null;
    let promptError: string | null = null; // Added

    // --- Discover Tools ---
    try {
        // Use the potentially modified config for the discovery call
        discoveredTools = await listToolsFromServer(discoveryServerConfig);

        // Delete existing tools
        await db.delete(toolsTable).where(eq(toolsTable.mcp_server_uuid, serverUuid));

        // Insert new tools
        if (discoveredTools.length > 0) {
            const toolsToInsert = discoveredTools.map(tool => ({
                mcp_server_uuid: serverUuid,
                name: tool.name, // Keep original name without transformation
                description: tool.description,
                // Ensure inputSchema is stored correctly as JSONB
                toolSchema: tool.inputSchema as any, // Cast if necessary, Drizzle handles JSONB
                status: ToggleStatus.ACTIVE,
            }));
            await db.insert(toolsTable).values(toolsToInsert);
        }
    } catch (error: any) {
        // Ignore abort errors for Streamable HTTP - they're expected during cleanup
        const isAbortError = error?.code === 20 || 
                           error?.name === 'AbortError' || 
                           error?.message?.includes('abort') ||
                           error?.message?.includes('This operation was aborted');
        
        if (!isAbortError) {
            console.error('[Action Error] Failed to discover/store tools for server:', { server: serverConfig.name || serverUuid, error });
        }
        
        toolError = isAbortError ? null : error.message;
        
        // Check if this is a 401 authentication error
        const is401Error = error.message?.includes('401') || 
                         error.message?.includes('invalid_token') ||
                         error.message?.includes('Unauthorized');
        
        if (is401Error) {
            // Update server config to mark as requires auth
            try {
                const currentConfig = serverConfig.config as any || {};
                const updatedConfig = {
                    ...currentConfig,
                    requires_auth: true,
                    last_401_error: new Date().toISOString()
                };
                
                await db.update(mcpServersTable)
                    .set({ 
                        config: updatedConfig
                    })
                    .where(eq(mcpServersTable.uuid, serverUuid));
                    
            } catch (updateError) {
                console.error('Failed to update server auth status:', updateError);
            }
        }
    }

    // --- Discover Resource Templates ---
    try {
        // Use the potentially modified config for the discovery call
        discoveredTemplates = await listResourceTemplatesFromServer(discoveryServerConfig);

        // Delete existing templates
        await db.delete(resourceTemplatesTable).where(eq(resourceTemplatesTable.mcp_server_uuid, serverUuid));

        // Insert new templates
        if (discoveredTemplates.length > 0) {
            const templatesToInsert = discoveredTemplates.map(template => {
                // Extract variables from URI template (simple regex example)
                const variables = template.uriTemplate.match(/\{([^}]+)\}/g)?.map((v: string) => v.slice(1, -1)) || []; // Add type for v
                return {
                    mcp_server_uuid: serverUuid,
                    uri_template: template.uriTemplate,
                    name: template.name,
                    description: template.description,
                    mime_type: typeof template.mediaType === 'string' ? template.mediaType : null, // Ensure it's a string or null
                    template_variables: variables, // Store extracted variables
                };
            });
            await db.insert(resourceTemplatesTable).values(templatesToInsert);
        }
    } catch (error: any) {
        // Ignore abort errors for Streamable HTTP - they're expected during cleanup
        const isAbortError = error?.code === 20 || 
                           error?.name === 'AbortError' || 
                           error?.message?.includes('abort') ||
                           error?.message?.includes('This operation was aborted');
        
        if (!isAbortError) {
            console.error('[Action Error] Failed to discover/store resource templates for server:', { server: serverConfig.name || serverUuid, error });
        }
        
        templateError = isAbortError ? null : error.message;
    }

    // --- Discover Static Resources ---
    try {
        // Use the potentially modified config for the discovery call
        discoveredResources = await listResourcesFromServer(discoveryServerConfig);

        // Delete existing resources
        await db.delete(resourcesTable).where(eq(resourcesTable.mcp_server_uuid, serverUuid));

        // Insert new resources
        if (discoveredResources.length > 0) {
            const resourcesToInsert = discoveredResources.map((resource: InferredResource) => ({ // Use inferred type
                mcp_server_uuid: serverUuid,
                uri: resource.uri,
                name: resource.name,
                description: resource.description,
                mime_type: typeof resource.mimeType === 'string' ? resource.mimeType : null, // Ensure it's a string or null
                size: resource.size ?? null, // Handle optional size
            }));
            await db.insert(resourcesTable).values(resourcesToInsert);
        }
    } catch (error: any) {
        // Ignore abort errors for Streamable HTTP - they're expected during cleanup
        const isAbortError = error?.code === 20 || 
                           error?.name === 'AbortError' || 
                           error?.message?.includes('abort') ||
                           error?.message?.includes('This operation was aborted');
        
        if (!isAbortError) {
            console.error('[Action Error] Failed to discover/store static resources for server:', { server: serverConfig.name || serverUuid, error });
        }
        
        resourceError = isAbortError ? null : error.message;
    }

    // --- Discover Prompts ---
    try {
        // Use the potentially modified config for the discovery call
        discoveredPrompts = await listPromptsFromServer(discoveryServerConfig);

        // Delete existing prompts
        await db.delete(promptsTable).where(eq(promptsTable.mcp_server_uuid, serverUuid));

        // Insert new prompts
        if (discoveredPrompts.length > 0) {
            const promptsToInsert = discoveredPrompts.map((prompt: InferredPrompt) => ({ // Use inferred type
                mcp_server_uuid: serverUuid,
                name: prompt.name,
                description: prompt.description,
                // Ensure arguments_schema is stored correctly as JSONB
                arguments_schema: prompt.arguments as any, // Cast if necessary, Drizzle handles JSONB
            }));
            await db.insert(promptsTable).values(promptsToInsert);
        }
    } catch (error: any) {
        // Ignore abort errors for Streamable HTTP - they're expected during cleanup
        const isAbortError = error?.code === 20 || 
                           error?.name === 'AbortError' || 
                           error?.message?.includes('abort') ||
                           error?.message?.includes('This operation was aborted');
        
        if (!isAbortError) {
            console.error('[Action Error] Failed to discover/store prompts for server:', { server: serverConfig.name || serverUuid, error });
        }
        
        promptError = isAbortError ? null : error.message;
    }


    // --- Final Result ---
    // Revalidate relevant paths if needed
    // revalidatePath('/mcp-servers');

    const success = !toolError && !templateError && !resourceError && !promptError; // Include promptError
    let message = '';
    const counts = [
        `${discoveredTools.length} tools`,
        `${discoveredTemplates.length} templates`,
        `${discoveredResources.length} resources`,
        `${discoveredPrompts.length} prompts` // Add prompts count
    ];
    if (success) {
        message = `Successfully discovered ${counts.join(', ')} for ${serverConfig.name || serverUuid}.`;
    } else {
        message = `Discovery partially failed for ${serverConfig.name || serverUuid}.`;
        if (toolError) message += ` Tool error: ${toolError}`;
        if (templateError) message += ` Template error: ${templateError}`;
        if (resourceError) message += ` Resource error: ${resourceError}`;
        if (promptError) message += ` Prompt error: ${promptError}`; // Add prompt error
    }

    return { success, message, error: success ? undefined : (toolError || templateError || resourceError || promptError || 'Unknown discovery error') }; // Include promptError

  } catch (error: any) {
    console.error('[Action Error] Failed to discover tools for server:', { serverUuid, error });
    return { success: false, message: `Failed to discover tools for server ${serverUuid}.`, error: error.message };
  }
}
