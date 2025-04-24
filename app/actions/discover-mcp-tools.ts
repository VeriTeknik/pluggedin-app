'use server';

import { and, eq } from 'drizzle-orm';

// import { revalidatePath } from 'next/cache';
import { db } from '@/db';
// Import promptsTable and Prompt type
import { mcpServersTable, promptsTable, resourcesTable, resourceTemplatesTable, ToggleStatus, toolsTable } from '@/db/schema'; // Sorted
import { listPromptsFromServer, listResourcesFromServer, listResourceTemplatesFromServer, listToolsFromServer } from '@/lib/mcp/client-wrapper'; // Sorted
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
  console.log(`[Action] discoverSingleServerTools called for server: ${serverUuid} in profile: ${profileUuid}`);

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

    console.log(`[Action] Found server config for ${serverConfig.name || serverUuid}`);

    // Reverted: No longer modifying command path here. Relying on PATH.
    const discoveryServerConfig = { ...serverConfig }; // Keep using a copy

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
        console.log(`[Action] Discovering tools for ${discoveryServerConfig.name || serverUuid}...`);
        // Use the potentially modified config for the discovery call
        discoveredTools = await listToolsFromServer(discoveryServerConfig);
        console.log(`[Action] Discovered ${discoveredTools.length} tools.`);

        // Delete existing tools
        console.log(`[Action] Deleting old tools for server: ${serverUuid}`);
        await db.delete(toolsTable).where(eq(toolsTable.mcp_server_uuid, serverUuid));

        // Insert new tools
        if (discoveredTools.length > 0) {
            console.log(`[Action] Inserting ${discoveredTools.length} new tools...`);
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
    }

    // --- Discover Resource Templates ---
    try {
        console.log(`[Action] Discovering resource templates for ${discoveryServerConfig.name || serverUuid}...`);
        // Use the potentially modified config for the discovery call
        discoveredTemplates = await listResourceTemplatesFromServer(discoveryServerConfig);
        console.log(`[Action] Discovered ${discoveredTemplates.length} resource templates.`);

        // Delete existing templates
        console.log(`[Action] Deleting old resource templates for server: ${serverUuid}`);
        await db.delete(resourceTemplatesTable).where(eq(resourceTemplatesTable.mcp_server_uuid, serverUuid));

        // Insert new templates
        if (discoveredTemplates.length > 0) {
            console.log(`[Action] Inserting ${discoveredTemplates.length} new resource templates...`);
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
        console.log(`[Action] Discovering static resources for ${discoveryServerConfig.name || serverUuid}...`);
        // Use the potentially modified config for the discovery call
        discoveredResources = await listResourcesFromServer(discoveryServerConfig);
        console.log(`[Action] Discovered ${discoveredResources.length} static resources.`);

        // Delete existing resources
        console.log(`[Action] Deleting old static resources for server: ${serverUuid}`);
        await db.delete(resourcesTable).where(eq(resourcesTable.mcp_server_uuid, serverUuid));

        // Insert new resources
        if (discoveredResources.length > 0) {
            console.log(`[Action] Inserting ${discoveredResources.length} new static resources...`);
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
        console.log(`[Action] Discovering prompts for ${discoveryServerConfig.name || serverUuid}...`);
        // Use the potentially modified config for the discovery call
        discoveredPrompts = await listPromptsFromServer(discoveryServerConfig);
        console.log(`[Action] Discovered ${discoveredPrompts.length} prompts.`);

        // Delete existing prompts
        console.log(`[Action] Deleting old prompts for server: ${serverUuid}`);
        await db.delete(promptsTable).where(eq(promptsTable.mcp_server_uuid, serverUuid));

        // Insert new prompts
        if (discoveredPrompts.length > 0) {
            console.log(`[Action] Inserting ${discoveredPrompts.length} new prompts...`);
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
    console.log(`[Action] Discovery process finished for ${serverUuid}. Success: ${success}`);

    return { success, message, error: success ? undefined : (toolError || templateError || resourceError || promptError || 'Unknown discovery error') }; // Include promptError

  } catch (error: any) {
    console.error(`[Action Error] Failed to discover tools for server ${serverUuid}:`, error);
    return { success: false, message: `Failed to discover tools for server ${serverUuid}.`, error: error.message };
  }
}
