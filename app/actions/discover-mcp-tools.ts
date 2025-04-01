'use server';

import { and, eq } from 'drizzle-orm';

// import { revalidatePath } from 'next/cache'; // Removed unused import
import { db } from '@/db';
import { mcpServersTable, resourceTemplatesTable, ToggleStatus,toolsTable } from '@/db/schema'; // Added resourceTemplatesTable
// Removed getUserData import - profileUuid will be passed as argument
// Import the actual discovery logic using @h1deya/langchain-mcp-tools
// Note: convertMcpToLangchainTools only handles tools. We need direct SDK usage for templates.
// import { convertMcpToLangchainTools, McpServersConfig } from '@h1deya/langchain-mcp-tools';
import { listResourceTemplatesFromServer,listToolsFromServer } from '@/lib/mcp/client-wrapper'; // Import from our wrapper
// Remove explicit SDK type imports - rely on inference from wrapper functions
// import type { Tool, ResourceTemplate } from '@modelcontextprotocol/sdk/types';

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

    // 1. Construct the McpServersConfig object for the single server
    // Ensure server name is used as key, handle potential null/empty names
    console.log(`[Action] Found server config for ${serverConfig.name || serverUuid}`);

    let discoveredTools: Awaited<ReturnType<typeof listToolsFromServer>> = []; // Infer type
    let discoveredTemplates: Awaited<ReturnType<typeof listResourceTemplatesFromServer>> = []; // Infer type
    let toolError: string | null = null;
    let templateError: string | null = null;

    // --- Discover Tools ---
    try {
        console.log(`[Action] Discovering tools for ${serverConfig.name || serverUuid}...`);
        discoveredTools = await listToolsFromServer(serverConfig);
        console.log(`[Action] Discovered ${discoveredTools.length} tools.`);

        // Delete existing tools
        console.log(`[Action] Deleting old tools for server: ${serverUuid}`);
        await db.delete(toolsTable).where(eq(toolsTable.mcp_server_uuid, serverUuid));

        // Insert new tools
        if (discoveredTools.length > 0) {
            console.log(`[Action] Inserting ${discoveredTools.length} new tools...`);
            const toolsToInsert = discoveredTools.map(tool => ({
                mcp_server_uuid: serverUuid,
                name: tool.name,
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
        console.log(`[Action] Discovering resource templates for ${serverConfig.name || serverUuid}...`);
        discoveredTemplates = await listResourceTemplatesFromServer(serverConfig);
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
                    mime_type: template.mediaType, // Correct field name? Check schema.ts
                    template_variables: variables, // Store extracted variables
                };
            });
            await db.insert(resourceTemplatesTable).values(templatesToInsert);
        }
    } catch (error: any) {
        console.error(`[Action Error] Failed to discover/store resource templates for ${serverConfig.name || serverUuid}:`, error);
        templateError = error.message;
    }

    // --- Final Result ---
    // Revalidate relevant paths if needed
    // revalidatePath('/mcp-servers');

    const success = !toolError && !templateError;
    let message = '';
    if (success) {
        message = `Successfully discovered ${discoveredTools.length} tools and ${discoveredTemplates.length} templates for ${serverConfig.name || serverUuid}.`;
    } else {
        message = `Discovery partially failed for ${serverConfig.name || serverUuid}.`;
        if (toolError) message += ` Tool error: ${toolError}`;
        if (templateError) message += ` Template error: ${templateError}`;
    }
    console.log(`[Action] Discovery process finished for ${serverUuid}. Success: ${success}`);

    return { success, message, error: success ? undefined : (toolError || templateError || 'Unknown discovery error') };

  } catch (error: any) {
    console.error(`[Action Error] Failed to discover tools for server ${serverUuid}:`, error);
    return { success: false, message: `Failed to discover tools for server ${serverUuid}.`, error: error.message };
  }
}
