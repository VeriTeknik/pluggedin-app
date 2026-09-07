'use server';

import { and, eq } from 'drizzle-orm';

// import { revalidatePath } from 'next/cache';
import { db } from '@/db';
// Import promptsTable and Prompt type
import { mcpServersTable, profilesTable, promptsTable, resourcesTable, resourceTemplatesTable, ToggleStatus, toolsTable } from '@/db/schema'; // Sorted
import { withAuth } from '@/lib/auth-helpers';
import { decryptServerData } from '@/lib/encryption';
import { listPromptsFromServer, listResourcesFromServer, listResourceTemplatesFromServer, listToolsFromServer } from '@/lib/mcp/client-wrapper'; // Sorted
import { categorizeError, mcpCapabilitiesDiscovered, mcpDiscoveryDuration, mcpDiscoveryFailures } from '@/lib/mcp/metrics';
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
    const toolsStartTime = Date.now();
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

        // Track successful discovery
        const toolsDurationMs = Date.now() - toolsStartTime;
        const transport = discoveryServerConfig.transport || (discoveryServerConfig.type === 'STREAMABLE_HTTP' ? 'streamable_http' : discoveryServerConfig.type === 'SSE' ? 'sse' : 'stdio');
        mcpDiscoveryDuration.observe({ operation: 'tools', transport, status: 'success' }, toolsDurationMs / 1000);
        if (discoveredTools.length > 0) {
            mcpCapabilitiesDiscovered.inc({ type: 'tool', server_type: discoveryServerConfig.type || 'unknown', transport }, discoveredTools.length);
        }

        console.log('[MCP Discovery]', {
            operation: 'tools',
            serverName: serverConfig.name,
            serverUuid,
            transport,
            count: discoveredTools.length,
            durationMs: toolsDurationMs,
            status: 'success',
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        const toolsDurationMs = Date.now() - toolsStartTime;
        const transport = discoveryServerConfig.transport || (discoveryServerConfig.type === 'STREAMABLE_HTTP' ? 'streamable_http' : discoveryServerConfig.type === 'SSE' ? 'sse' : 'stdio');

        // Ignore abort errors for Streamable HTTP - they're expected during cleanup
        const isAbortError = error?.code === 20 ||
                           error?.name === 'AbortError' ||
                           error?.message?.includes('abort') ||
                           error?.message?.includes('This operation was aborted');

        if (!isAbortError) {
            console.error('[Action Error] Failed to discover/store tools for server:', { server: serverConfig.name || serverUuid, error });

            // Track failed discovery
            const errorType = categorizeError(error);
            mcpDiscoveryDuration.observe({ operation: 'tools', transport, status: 'error' }, toolsDurationMs / 1000);
            mcpDiscoveryFailures.inc({ operation: 'tools', transport, error_type: errorType });

            console.log('[MCP Discovery Failed]', {
                operation: 'tools',
                serverName: serverConfig.name,
                serverUuid,
                transport,
                errorType,
                durationMs: toolsDurationMs,
                status: 'error',
                timestamp: new Date().toISOString()
            });
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
    const templatesStartTime = Date.now();
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
                    mime_type: typeof template.mimeType === 'string' ? template.mimeType : null, // Ensure it's a string or null
                    template_variables: variables, // Store extracted variables
                };
            });
            await db.insert(resourceTemplatesTable).values(templatesToInsert);
        }

        // Track successful discovery
        const templatesDurationMs = Date.now() - templatesStartTime;
        const transport = discoveryServerConfig.transport || (discoveryServerConfig.type === 'STREAMABLE_HTTP' ? 'streamable_http' : discoveryServerConfig.type === 'SSE' ? 'sse' : 'stdio');
        mcpDiscoveryDuration.observe({ operation: 'resource_templates', transport, status: 'success' }, templatesDurationMs / 1000);
        if (discoveredTemplates.length > 0) {
            mcpCapabilitiesDiscovered.inc({ type: 'resource_template', server_type: discoveryServerConfig.type || 'unknown', transport }, discoveredTemplates.length);
        }

        console.log('[MCP Discovery]', {
            operation: 'resource_templates',
            serverName: serverConfig.name,
            serverUuid,
            transport,
            count: discoveredTemplates.length,
            durationMs: templatesDurationMs,
            status: 'success',
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        const templatesDurationMs = Date.now() - templatesStartTime;
        const transport = discoveryServerConfig.transport || (discoveryServerConfig.type === 'STREAMABLE_HTTP' ? 'streamable_http' : discoveryServerConfig.type === 'SSE' ? 'sse' : 'stdio');

        // Ignore abort errors for Streamable HTTP - they're expected during cleanup
        const isAbortError = error?.code === 20 ||
                           error?.name === 'AbortError' ||
                           error?.message?.includes('abort') ||
                           error?.message?.includes('This operation was aborted');

        if (!isAbortError) {
            console.error('[Action Error] Failed to discover/store resource templates for server:', { server: serverConfig.name || serverUuid, error });

            // Track failed discovery
            const errorType = categorizeError(error);
            mcpDiscoveryDuration.observe({ operation: 'resource_templates', transport, status: 'error' }, templatesDurationMs / 1000);
            mcpDiscoveryFailures.inc({ operation: 'resource_templates', transport, error_type: errorType });

            console.log('[MCP Discovery Failed]', {
                operation: 'resource_templates',
                serverName: serverConfig.name,
                serverUuid,
                transport,
                errorType,
                durationMs: templatesDurationMs,
                status: 'error',
                timestamp: new Date().toISOString()
            });
        }

        templateError = isAbortError ? null : error.message;
    }

    // --- Discover Static Resources ---
    const resourcesStartTime = Date.now();
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
            }));
            await db.insert(resourcesTable).values(resourcesToInsert);
        }

        // Track successful discovery
        const resourcesDurationMs = Date.now() - resourcesStartTime;
        const transport = discoveryServerConfig.transport || (discoveryServerConfig.type === 'STREAMABLE_HTTP' ? 'streamable_http' : discoveryServerConfig.type === 'SSE' ? 'sse' : 'stdio');
        mcpDiscoveryDuration.observe({ operation: 'resources', transport, status: 'success' }, resourcesDurationMs / 1000);
        if (discoveredResources.length > 0) {
            mcpCapabilitiesDiscovered.inc({ type: 'resource', server_type: discoveryServerConfig.type || 'unknown', transport }, discoveredResources.length);
        }

        console.log('[MCP Discovery]', {
            operation: 'resources',
            serverName: serverConfig.name,
            serverUuid,
            transport,
            count: discoveredResources.length,
            durationMs: resourcesDurationMs,
            status: 'success',
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        const resourcesDurationMs = Date.now() - resourcesStartTime;
        const transport = discoveryServerConfig.transport || (discoveryServerConfig.type === 'STREAMABLE_HTTP' ? 'streamable_http' : discoveryServerConfig.type === 'SSE' ? 'sse' : 'stdio');

        // Ignore abort errors for Streamable HTTP - they're expected during cleanup
        const isAbortError = error?.code === 20 ||
                           error?.name === 'AbortError' ||
                           error?.message?.includes('abort') ||
                           error?.message?.includes('This operation was aborted');

        if (!isAbortError) {
            console.error('[Action Error] Failed to discover/store static resources for server:', { server: serverConfig.name || serverUuid, error });

            // Track failed discovery
            const errorType = categorizeError(error);
            mcpDiscoveryDuration.observe({ operation: 'resources', transport, status: 'error' }, resourcesDurationMs / 1000);
            mcpDiscoveryFailures.inc({ operation: 'resources', transport, error_type: errorType });

            console.log('[MCP Discovery Failed]', {
                operation: 'resources',
                serverName: serverConfig.name,
                serverUuid,
                transport,
                errorType,
                durationMs: resourcesDurationMs,
                status: 'error',
                timestamp: new Date().toISOString()
            });
        }

        resourceError = isAbortError ? null : error.message;
    }

    // --- Discover Prompts ---
    const promptsStartTime = Date.now();
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

        // Track successful discovery
        const promptsDurationMs = Date.now() - promptsStartTime;
        const transport = discoveryServerConfig.transport || (discoveryServerConfig.type === 'STREAMABLE_HTTP' ? 'streamable_http' : discoveryServerConfig.type === 'SSE' ? 'sse' : 'stdio');
        mcpDiscoveryDuration.observe({ operation: 'prompts', transport, status: 'success' }, promptsDurationMs / 1000);
        if (discoveredPrompts.length > 0) {
            mcpCapabilitiesDiscovered.inc({ type: 'prompt', server_type: discoveryServerConfig.type || 'unknown', transport }, discoveredPrompts.length);
        }

        console.log('[MCP Discovery]', {
            operation: 'prompts',
            serverName: serverConfig.name,
            serverUuid,
            transport,
            count: discoveredPrompts.length,
            durationMs: promptsDurationMs,
            status: 'success',
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        const promptsDurationMs = Date.now() - promptsStartTime;
        const transport = discoveryServerConfig.transport || (discoveryServerConfig.type === 'STREAMABLE_HTTP' ? 'streamable_http' : discoveryServerConfig.type === 'SSE' ? 'sse' : 'stdio');

        // Ignore abort errors for Streamable HTTP - they're expected during cleanup
        const isAbortError = error?.code === 20 ||
                           error?.name === 'AbortError' ||
                           error?.message?.includes('abort') ||
                           error?.message?.includes('This operation was aborted');

        if (!isAbortError) {
            console.error('[Action Error] Failed to discover/store prompts for server:', { server: serverConfig.name || serverUuid, error });

            // Track failed discovery
            const errorType = categorizeError(error);
            mcpDiscoveryDuration.observe({ operation: 'prompts', transport, status: 'error' }, promptsDurationMs / 1000);
            mcpDiscoveryFailures.inc({ operation: 'prompts', transport, error_type: errorType });

            console.log('[MCP Discovery Failed]', {
                operation: 'prompts',
                serverName: serverConfig.name,
                serverUuid,
                transport,
                errorType,
                durationMs: promptsDurationMs,
                status: 'error',
                timestamp: new Date().toISOString()
            });
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
