'use server';

import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { mcpServersTable, promptsTable, resourcesTable, resourceTemplatesTable, ToggleStatus, toolsTable } from '@/db/schema';
import { decryptServerData } from '@/lib/encryption';
import { listPromptsFromServer, listResourcesFromServer, listResourceTemplatesFromServer, listToolsFromServer } from '@/lib/mcp/client-wrapper';
import { ConsoleCapture } from '@/lib/utils/console-capture';

type ResourcesArray = Awaited<ReturnType<typeof listResourcesFromServer>>;
type InferredResource = ResourcesArray[number];
type PromptsArray = Awaited<ReturnType<typeof listPromptsFromServer>>;
type InferredPrompt = PromptsArray[number];

/**
 * Discovers tools for a single MCP server and updates the database, with console output capture.
 * @param profileUuid The UUID of the profile the server belongs to.
 * @param serverUuid The UUID of the MCP server to discover tools for.
 * @returns An object indicating success or failure with a message and captured logs.
 */
export async function discoverSingleServerToolsWithLogs(
    profileUuid: string,
    serverUuid: string
): Promise<{ success: boolean; message: string; error?: string; logs: string[] }> {
  if (!profileUuid || !serverUuid) {
      return { success: false, message: 'Profile UUID and Server UUID are required.', logs: [] };
  }

  // Capture all console output during discovery
  const { result, output } = await ConsoleCapture.captureAsync(async () => {
    console.log(`[Action] discoverSingleServerTools called for server: ${serverUuid} in profile: ${profileUuid}`);

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
      console.log(`[Action] Server config has encrypted fields:`, {
        hasCommandEncrypted: !!serverConfig.command_encrypted,
        hasArgsEncrypted: !!serverConfig.args_encrypted,
        hasEnvEncrypted: !!serverConfig.env_encrypted,
        hasUrlEncrypted: !!serverConfig.url_encrypted,
        hasPlainCommand: !!serverConfig.command,
        hasPlainArgs: !!serverConfig.args,
        hasPlainEnv: !!serverConfig.env,
        hasPlainUrl: !!serverConfig.url
      });

      // Decrypt the server configuration
      const decryptedServerConfig = decryptServerData(serverConfig, profileUuid);
      console.log(`[Action] After decryption:`, {
        hasCommand: !!decryptedServerConfig.command,
        hasArgs: !!decryptedServerConfig.args,
        hasEnv: !!decryptedServerConfig.env,
        hasUrl: !!decryptedServerConfig.url,
        serverType: decryptedServerConfig.type
      });
      const discoveryServerConfig = { ...decryptedServerConfig };

      let discoveredTools: Awaited<ReturnType<typeof listToolsFromServer>> = [];
      let discoveredTemplates: Awaited<ReturnType<typeof listResourceTemplatesFromServer>> = [];
      let discoveredResources: Awaited<ReturnType<typeof listResourcesFromServer>> = [];
      let discoveredPrompts: Awaited<ReturnType<typeof listPromptsFromServer>> = [];
      let toolError: string | null = null;
      let templateError: string | null = null;
      let resourceError: string | null = null;
      let promptError: string | null = null;

      // --- Discover Tools ---
      try {
          console.log(`[Action] Discovering tools for ${discoveryServerConfig.name || serverUuid}...`);
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
                  name: tool.name,
                  description: tool.description,
                  toolSchema: tool.inputSchema as any,
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
          discoveredTemplates = await listResourceTemplatesFromServer(discoveryServerConfig);
          console.log(`[Action] Discovered ${discoveredTemplates.length} resource templates.`);

          // Delete existing templates
          console.log(`[Action] Deleting old resource templates for server: ${serverUuid}`);
          await db.delete(resourceTemplatesTable).where(eq(resourceTemplatesTable.mcp_server_uuid, serverUuid));

          // Insert new templates
          if (discoveredTemplates.length > 0) {
              console.log(`[Action] Inserting ${discoveredTemplates.length} new resource templates...`);
              const templatesToInsert = discoveredTemplates.map(template => ({
                  mcp_server_uuid: serverUuid,
                  uri_template: template.uriTemplate,
                  name: template.name,
                  description: template.description,
                  mime_type: template.mimeType,
              }));
              await db.insert(resourceTemplatesTable).values(templatesToInsert);
          }
      } catch (error: any) {
          console.error(`[Action Error] Failed to discover/store resource templates for ${serverConfig.name || serverUuid}:`, error);
          templateError = error.message;
      }

      // --- Discover Static Resources ---
      try {
          console.log(`[Action] Discovering static resources for ${discoveryServerConfig.name || serverUuid}...`);
          discoveredResources = await listResourcesFromServer(discoveryServerConfig);
          console.log(`[Action] Discovered ${discoveredResources.length} static resources.`);

          // Delete existing resources
          console.log(`[Action] Deleting old static resources for server: ${serverUuid}`);
          await db.delete(resourcesTable).where(eq(resourcesTable.mcp_server_uuid, serverUuid));

          // Insert new resources
          if (discoveredResources.length > 0) {
              console.log(`[Action] Inserting ${discoveredResources.length} new static resources...`);
              const resourcesToInsert = discoveredResources.map((resource: InferredResource) => ({
                  mcp_server_uuid: serverUuid,
                  uri: resource.uri,
                  name: resource.name,
                  description: resource.description,
                  mime_type: resource.mimeType,
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
          discoveredPrompts = await listPromptsFromServer(discoveryServerConfig);
          console.log(`[Action] Discovered ${discoveredPrompts.length} prompts.`);

          // Delete existing prompts
          console.log(`[Action] Deleting old prompts for server: ${serverUuid}`);
          await db.delete(promptsTable).where(eq(promptsTable.mcp_server_uuid, serverUuid));

          // Insert new prompts
          if (discoveredPrompts.length > 0) {
              console.log(`[Action] Inserting ${discoveredPrompts.length} new prompts...`);
              const promptsToInsert = discoveredPrompts.map((prompt: InferredPrompt) => ({
                  mcp_server_uuid: serverUuid,
                  name: prompt.name,
                  description: prompt.description,
                  arguments: prompt.arguments as any,
              }));
              await db.insert(promptsTable).values(promptsToInsert);
          }
      } catch (error: any) {
          console.error(`[Action Error] Failed to discover/store prompts for ${serverConfig.name || serverUuid}:`, error);
          promptError = error.message;
      }

      // Create summary message with errors
      const errors = [toolError, templateError, resourceError, promptError].filter(Boolean);
      if (errors.length > 0) {
          const summaryParts = [];
          if (!toolError) summaryParts.push(`${discoveredTools.length} tools`);
          if (!templateError) summaryParts.push(`${discoveredTemplates.length} resource templates`);
          if (!resourceError) summaryParts.push(`${discoveredResources.length} static resources`);
          if (!promptError) summaryParts.push(`${discoveredPrompts.length} prompts`);
          
          const successMessage = summaryParts.length > 0 
              ? `Successfully discovered: ${summaryParts.join(', ')}.`
              : '';
          const errorMessage = `Errors occurred: ${errors.join('; ')}`;
          
          return {
              success: false,
              message: `${successMessage} ${errorMessage}`.trim(),
              error: errors.join('; ')
          };
      }

      // All successful
      const message = `Discovered ${discoveredTools.length} tools, ${discoveredTemplates.length} resource templates, ${discoveredResources.length} static resources, and ${discoveredPrompts.length} prompts.`;
      return { success: true, message };
    } catch (error: any) {
      console.error(`[Action Error] Unexpected error during discovery:`, error);
      return { 
        success: false, 
        message: 'Unexpected error during discovery', 
        error: error.message 
      };
    }
  });

  // Add the captured logs to the result
  const finalResult = result || { success: false, message: 'Discovery failed', error: 'Unknown error' };
  return { ...finalResult, logs: output };
}