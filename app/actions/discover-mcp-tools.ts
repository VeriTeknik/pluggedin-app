'use server';

import { and, eq } from 'drizzle-orm';
// import { revalidatePath } from 'next/cache'; // Removed unused import

import { db } from '@/db';
import { mcpServersTable, toolsTable, ToggleStatus } from '@/db/schema'; // Added ToggleStatus
// Removed getUserData import - profileUuid will be passed as argument

// Import the actual discovery logic using @h1deya/langchain-mcp-tools
import { convertMcpToLangchainTools, McpServersConfig } from '@h1deya/langchain-mcp-tools';
// import { BaseLanguageModel } from '@langchain/core/language_models/base'; // Removed unused import
// import { Tool as LangchainTool } from '@langchain/core/tools'; // Use any[] for discoveredTools type

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
    const serverKey = serverConfig.name || serverUuid;
    const configForTool: McpServersConfig = { [serverKey]: serverConfig as any };

    let discoveredTools: any[] = []; // Use any[] to avoid type mismatch from library
    let cleanup: (() => Promise<void>) | undefined;

    try {
        console.log(`[Action] Connecting to ${serverKey} to discover tools...`);
        // 2. Call convertMcpToLangchainTools to get tools
        // We don't need the LLM here, just the tools and cleanup
        const result = await convertMcpToLangchainTools(
            configForTool,
            {
                // No LLM needed for discovery
                // llm: undefined as unknown as BaseLanguageModel,
                // No logger needed here, handle errors directly
                // logger: undefined,
            }
        );
        discoveredTools = result.tools;
        cleanup = result.cleanup; // Get the cleanup function
        console.log(`[Action] Discovered ${discoveredTools.length} tools from ${serverKey}.`);

    } catch (discoveryError: any) {
        console.error(`[Action Error] Failed to connect or list tools for ${serverKey}:`, discoveryError);
        // Return specific error message
        return { success: false, message: `Failed to connect or list tools for ${serverConfig.name || serverUuid}.`, error: discoveryError.message };
    } finally {
        // Ensure cleanup is called even if discovery fails after connection
        if (cleanup) {
            console.log(`[Action] Cleaning up connection for ${serverKey}...`);
            await cleanup().catch(cleanupError => {
                console.error(`[Action Error] Error during cleanup for ${serverKey}:`, cleanupError);
                // Don't block return if cleanup fails, but log it
            });
        }
    }

    // 3. Delete existing tools for this serverUuid from toolsTable
    console.log(`[Action] Deleting old tools for server: ${serverUuid}`);
    await db.delete(toolsTable).where(eq(toolsTable.mcp_server_uuid, serverUuid));

    // 4. Insert the newly discovered tools into toolsTable
    if (discoveredTools.length > 0) {
        console.log(`[Action] Inserting ${discoveredTools.length} new tools for server: ${serverUuid}`);
        const toolsToInsert = discoveredTools.map(tool => {
            // Extract schema - Langchain Tool has 'schema' which is the Zod schema
            // We need the JSON representation for the DB
            let toolSchemaJson: any = {};
            try {
                // Attempt to get JSON schema from the Langchain tool if possible
                // This depends on the internal structure of the Tool object from the library
                // Assuming tool.schema is the Zod schema object
                if (tool.schema && typeof tool.schema === 'object') {
                   // If it's already a plain object (less likely), use it
                   // More likely it's a Zod schema, need conversion (zod-to-json-schema might be needed here if not already done by library)
                   // For now, let's assume it might be directly usable or needs specific handling
                   // Let's store the raw schema object for now, casting to any
                   toolSchemaJson = tool.schema;
                } else {
                   console.warn(`[Action] Could not extract schema for tool ${tool.name} from ${serverKey}. Storing empty object.`);
                }
            } catch (schemaError) {
                 console.error(`[Action Error] Failed to process schema for tool ${tool.name} from ${serverKey}:`, schemaError);
                 toolSchemaJson = { error: 'Schema processing failed' };
            }

            return {
                mcp_server_uuid: serverUuid,
                name: tool.name,
                description: tool.description,
                toolSchema: toolSchemaJson, // Store the extracted/processed schema
                status: ToggleStatus.ACTIVE, // Default new tools to ACTIVE
            };
        });
        await db.insert(toolsTable).values(toolsToInsert);
    } else {
        console.log(`[Action] No tools discovered for server: ${serverUuid}`);
    }

    // Revalidate relevant paths if needed (e.g., the page displaying tools)
    // revalidatePath('/mcp-servers'); // Example path

    console.log(`[Action] Tool discovery completed for server: ${serverUuid}`);
    return { success: true, message: `Successfully discovered ${discoveredTools.length} tools for ${serverConfig.name || serverUuid}.` };

  } catch (error: any) {
    console.error(`[Action Error] Failed to discover tools for server ${serverUuid}:`, error);
    return { success: false, message: `Failed to discover tools for server ${serverUuid}.`, error: error.message };
  }
}
