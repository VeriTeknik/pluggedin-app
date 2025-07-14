'use server';

import { and, eq } from 'drizzle-orm';

// import { revalidatePath } from 'next/cache';
import { db } from '@/db';
// Import promptsTable and Prompt type
import { mcpServersTable, promptsTable, resourcesTable, resourceTemplatesTable, ToggleStatus, toolsTable } from '@/db/schema'; // Sorted
import { decryptServerData } from '@/lib/encryption';
import { listPromptsFromServer, listResourcesFromServer, listResourceTemplatesFromServer, listToolsFromServer } from '@/lib/mcp/client-wrapper'; // Sorted
import { McpServer } from '@/types/mcp-server';
// Removed getUserData import
// import { convertMcpToLangchainTools, McpServersConfig } from '@h1deya/langchain-mcp-tools';
// Removed direct SDK type import

// Infer Resource type
type ResourcesArray = Awaited<ReturnType<typeof listResourcesFromServer>>;
type InferredResource = ResourcesArray[number];
// Infer Prompt type
type PromptsArray = Awaited<ReturnType<typeof listPromptsFromServer>>;
type InferredPrompt = PromptsArray[number];

/**
 * Discovers tools for a single MCP server and updates the database.
 * @param profileUuid The UUID of the profile the server belongs to.
 * @param serverUuid The UUID of the MCP server to discover tools for.
 * @returns An object indicating success or failure with a message.
 */
export async function discoverSingleServerTools(
    profileUuid: string,
    serverUuid: string
): Promise<{ success: boolean; message: string; error?: string }> {

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
    const decryptedServerConfig = decryptServerData(serverConfig, profileUuid);
    const discoveryServerConfig: McpServer = { 
        ...decryptedServerConfig,
        config: decryptedServerConfig.config as Record<string, any> | null
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
        console.error(`[Action Error] Failed to discover/store tools for ${serverConfig.name || serverUuid}:`, error);
        toolError = error.message;
        
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
        console.error(`[Action Error] Failed to discover/store resource templates for ${serverConfig.name || serverUuid}:`, error);
        templateError = error.message;
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
        console.error(`[Action Error] Failed to discover/store static resources for ${serverConfig.name || serverUuid}:`, error);
        resourceError = error.message;
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
        console.error(`[Action Error] Failed to discover/store prompts for ${serverConfig.name || serverUuid}:`, error);
        promptError = error.message;
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
    console.error(`[Action Error] Failed to discover tools for server ${serverUuid}:`, error);
    return { success: false, message: `Failed to discover tools for server ${serverUuid}.`, error: error.message };
  }
}
