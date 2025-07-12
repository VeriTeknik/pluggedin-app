import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { mcpServersTable, profilesTable, promptsTable, resourcesTable, resourceTemplatesTable, ToggleStatus, toolsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { decryptServerData } from '@/lib/encryption';
import { listPromptsFromServer, listResourcesFromServer, listResourceTemplatesFromServer, listToolsFromServer } from '@/lib/mcp/client-wrapper';

interface StreamMessage {
  type: 'log' | 'progress' | 'error' | 'complete';
  message: string;
  timestamp: number;
  data?: any;
}

function createSSEResponse() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController;
  let isClosed = false;
  
  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
    cancel() {
      isClosed = true;
    }
  });

  const sendMessage = (message: StreamMessage) => {
    if (isClosed) return; // Don't send if stream is closed
    
    try {
      const data = `data: ${JSON.stringify(message)}\n\n`;
      controller.enqueue(encoder.encode(data));
    } catch (error) {
      // Stream might be closed, mark as closed to prevent further sends
      isClosed = true;
    }
  };

  const close = () => {
    if (isClosed) return; // Don't close if already closed
    
    try {
      controller.close();
      isClosed = true;
    } catch (error) {
      // Already closed, just mark as closed
      isClosed = true;
    }
  };

  return { stream, sendMessage, close };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serverUuid: string }> }
) {
  try {
    const { serverUuid } = await params;
    
    // Authenticate using session and get profile UUID from query params
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Get profile UUID from query parameters
    const profileUuid = request.nextUrl.searchParams.get('profileUuid');
    if (!profileUuid) {
      return new NextResponse('Profile UUID required', { status: 400 });
    }

    // Validate user has access to this profile
    const profile = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.uuid, profileUuid),
      with: {
        project: true
      }
    });

    if (!profile || profile.project.user_id !== session.user.id) {
      return new NextResponse('Unauthorized access to profile', { status: 403 });
    }

    const { stream, sendMessage, close } = createSSEResponse();

    // Run discovery in the background
    (async () => {
      try {
        sendMessage({
          type: 'log',
          message: '=== MCP Discovery Started ===',
          timestamp: Date.now(),
        });

        sendMessage({
          type: 'log',
          message: `Server UUID: ${serverUuid}`,
          timestamp: Date.now(),
        });

        // Fetch server configuration
        sendMessage({
          type: 'log',
          message: 'Fetching server configuration from database...',
          timestamp: Date.now(),
        });

        const serverConfig = await db.query.mcpServersTable.findFirst({
          where: and(
            eq(mcpServersTable.uuid, serverUuid),
            eq(mcpServersTable.profile_uuid, profileUuid)
          ),
        });

        if (!serverConfig) {
          sendMessage({
            type: 'error',
            message: `Server with UUID ${serverUuid} not found for the active profile.`,
            timestamp: Date.now(),
          });
          close();
          return;
        }

        sendMessage({
          type: 'log',
          message: `Found server config for ${serverConfig.name || serverUuid}`,
          timestamp: Date.now(),
        });

        // Decrypt server configuration
        sendMessage({
          type: 'log',
          message: 'Decrypting server configuration...',
          timestamp: Date.now(),
        });

        const decryptedServerConfig = decryptServerData(serverConfig, profileUuid);

        // Discovery phase indicators
        let discoveredTools: any[] = [];
        let discoveredTemplates: any[] = [];
        let discoveredResources: any[] = [];
        let discoveredPrompts: any[] = [];
        let toolError: string | null = null;
        let templateError: string | null = null;
        let resourceError: string | null = null;
        let promptError: string | null = null;

        // --- Discover Tools ---
        sendMessage({
          type: 'progress',
          message: 'Discovering tools...',
          timestamp: Date.now(),
        });

        try {
          discoveredTools = await listToolsFromServer(decryptedServerConfig);
          sendMessage({
            type: 'log',
            message: `Discovered ${discoveredTools.length} tools`,
            timestamp: Date.now(),
          });

          // Delete existing tools
          sendMessage({
            type: 'log',
            message: `Deleting old tools for server: ${serverUuid}`,
            timestamp: Date.now(),
          });
          
          await db.delete(toolsTable).where(eq(toolsTable.mcp_server_uuid, serverUuid));

          // Insert new tools
          if (discoveredTools.length > 0) {
            sendMessage({
              type: 'log',
              message: `Inserting ${discoveredTools.length} new tools...`,
              timestamp: Date.now(),
            });

            const toolsToInsert = discoveredTools.map(tool => ({
              mcp_server_uuid: serverUuid,
              name: tool.name,
              description: tool.description,
              toolSchema: tool.inputSchema as any,
              status: ToggleStatus.ACTIVE,
            }));
            
            await db.insert(toolsTable).values(toolsToInsert);
            
            sendMessage({
              type: 'log',
              message: `Successfully stored ${discoveredTools.length} tools`,
              timestamp: Date.now(),
            });
          }
        } catch (error: any) {
          toolError = error.message;
          
          // Check if this is a 401 authentication error
          const is401Error = error.code === 401 || 
                           error.message?.includes('401') || 
                           error.message?.includes('Unauthorized');
          
          if (is401Error) {
            // Update server config to mark as requires auth
            try {
              const currentServer = await db.query.mcpServersTable.findFirst({
                where: eq(mcpServersTable.uuid, serverUuid)
              });
              
              if (currentServer) {
                const updatedConfig = {
                  ...(currentServer.config as any || {}),
                  requires_auth: true,
                  last_401_error: new Date().toISOString()
                };
                
                await db.update(mcpServersTable)
                  .set({ 
                    config: updatedConfig,
                    updated_at: new Date()
                  })
                  .where(eq(mcpServersTable.uuid, serverUuid));
                  
                sendMessage({
                  type: 'log',
                  message: 'Server requires authentication - marked for OAuth',
                  timestamp: Date.now(),
                });
              }
            } catch (updateError) {
              console.error('Failed to update server auth status:', updateError);
            }
          }
          
          sendMessage({
            type: 'error',
            message: `Failed to discover/store tools: ${error.message}`,
            timestamp: Date.now(),
          });
        }

        // --- Discover Resource Templates ---
        sendMessage({
          type: 'progress',
          message: 'Discovering resource templates...',
          timestamp: Date.now(),
        });

        try {
          discoveredTemplates = await listResourceTemplatesFromServer(decryptedServerConfig);
          sendMessage({
            type: 'log',
            message: `Discovered ${discoveredTemplates.length} resource templates`,
            timestamp: Date.now(),
          });

          // Delete existing templates
          sendMessage({
            type: 'log',
            message: `Deleting old resource templates for server: ${serverUuid}`,
            timestamp: Date.now(),
          });
          
          await db.delete(resourceTemplatesTable).where(eq(resourceTemplatesTable.mcp_server_uuid, serverUuid));

          // Insert new templates
          if (discoveredTemplates.length > 0) {
            sendMessage({
              type: 'log',
              message: `Inserting ${discoveredTemplates.length} new resource templates...`,
              timestamp: Date.now(),
            });

            const templatesToInsert = discoveredTemplates.map(template => {
              const variables = template.uriTemplate.match(/\{([^}]+)\}/g)?.map((v: string) => v.slice(1, -1)) || [];
              return {
                mcp_server_uuid: serverUuid,
                uri_template: template.uriTemplate,
                name: template.name,
                description: template.description,
                mime_type: typeof template.mediaType === 'string' ? template.mediaType : null,
                template_variables: variables,
              };
            });
            
            await db.insert(resourceTemplatesTable).values(templatesToInsert);
            
            sendMessage({
              type: 'log',
              message: `Successfully stored ${discoveredTemplates.length} resource templates`,
              timestamp: Date.now(),
            });
          }
        } catch (error: any) {
          templateError = error.message;
          sendMessage({
            type: 'error',
            message: `Failed to discover/store resource templates: ${error.message}`,
            timestamp: Date.now(),
          });
        }

        // --- Discover Static Resources ---
        sendMessage({
          type: 'progress',
          message: 'Discovering static resources...',
          timestamp: Date.now(),
        });

        try {
          discoveredResources = await listResourcesFromServer(decryptedServerConfig);
          sendMessage({
            type: 'log',
            message: `Discovered ${discoveredResources.length} static resources`,
            timestamp: Date.now(),
          });

          // Delete existing resources
          sendMessage({
            type: 'log',
            message: `Deleting old static resources for server: ${serverUuid}`,
            timestamp: Date.now(),
          });
          
          await db.delete(resourcesTable).where(eq(resourcesTable.mcp_server_uuid, serverUuid));

          // Insert new resources
          if (discoveredResources.length > 0) {
            sendMessage({
              type: 'log',
              message: `Inserting ${discoveredResources.length} new static resources...`,
              timestamp: Date.now(),
            });

            const resourcesToInsert = discoveredResources.map((resource: any) => ({
              mcp_server_uuid: serverUuid,
              uri: resource.uri,
              name: resource.name,
              description: resource.description,
              mime_type: typeof resource.mimeType === 'string' ? resource.mimeType : null,
              size: resource.size ?? null,
            }));
            
            await db.insert(resourcesTable).values(resourcesToInsert);
            
            sendMessage({
              type: 'log',
              message: `Successfully stored ${discoveredResources.length} static resources`,
              timestamp: Date.now(),
            });
          }
        } catch (error: any) {
          resourceError = error.message;
          sendMessage({
            type: 'error',
            message: `Failed to discover/store static resources: ${error.message}`,
            timestamp: Date.now(),
          });
        }

        // --- Discover Prompts ---
        sendMessage({
          type: 'progress',
          message: 'Discovering prompts...',
          timestamp: Date.now(),
        });

        try {
          discoveredPrompts = await listPromptsFromServer(decryptedServerConfig);
          sendMessage({
            type: 'log',
            message: `Discovered ${discoveredPrompts.length} prompts`,
            timestamp: Date.now(),
          });

          // Delete existing prompts
          sendMessage({
            type: 'log',
            message: `Deleting old prompts for server: ${serverUuid}`,
            timestamp: Date.now(),
          });
          
          await db.delete(promptsTable).where(eq(promptsTable.mcp_server_uuid, serverUuid));

          // Insert new prompts
          if (discoveredPrompts.length > 0) {
            sendMessage({
              type: 'log',
              message: `Inserting ${discoveredPrompts.length} new prompts...`,
              timestamp: Date.now(),
            });

            const promptsToInsert = discoveredPrompts.map((prompt: any) => ({
              mcp_server_uuid: serverUuid,
              name: prompt.name,
              description: prompt.description,
              arguments_schema: prompt.arguments as any,
            }));
            
            await db.insert(promptsTable).values(promptsToInsert);
            
            sendMessage({
              type: 'log',
              message: `Successfully stored ${discoveredPrompts.length} prompts`,
              timestamp: Date.now(),
            });
          }
        } catch (error: any) {
          promptError = error.message;
          sendMessage({
            type: 'error',
            message: `Failed to discover/store prompts: ${error.message}`,
            timestamp: Date.now(),
          });
        }

        // Final result
        const success = !toolError && !templateError && !resourceError && !promptError;
        const counts = [
          `${discoveredTools.length} tools`,
          `${discoveredTemplates.length} templates`, 
          `${discoveredResources.length} resources`,
          `${discoveredPrompts.length} prompts`
        ];
        
        let finalMessage = '';
        if (success) {
          finalMessage = `Successfully discovered ${counts.join(', ')} for ${serverConfig.name || serverUuid}`;
        } else {
          finalMessage = `Discovery partially failed for ${serverConfig.name || serverUuid}`;
          if (toolError) finalMessage += ` Tool error: ${toolError}`;
          if (templateError) finalMessage += ` Template error: ${templateError}`;
          if (resourceError) finalMessage += ` Resource error: ${resourceError}`;
          if (promptError) finalMessage += ` Prompt error: ${promptError}`;
        }

        sendMessage({
          type: 'complete',
          message: finalMessage,
          timestamp: Date.now(),
          data: {
            success,
            tools: discoveredTools, // Send the actual arrays, not counts
            templates: discoveredTemplates,
            resources: discoveredResources,
            prompts: discoveredPrompts,
            toolsCount: discoveredTools.length,
            templatesCount: discoveredTemplates.length,
            resourcesCount: discoveredResources.length,
            promptsCount: discoveredPrompts.length,
            errors: {
              toolError,
              templateError,
              resourceError,
              promptError
            }
          },
        });

        sendMessage({
          type: 'log',
          message: '=== MCP Discovery Completed ===',
          timestamp: Date.now(),
        });

      } catch (error: any) {
        sendMessage({
          type: 'error',
          message: `Discovery failed: ${error.message}`,
          timestamp: Date.now(),
        });
      } finally {
        // Close the stream after a short delay to ensure all messages are sent
        setTimeout(() => {
          close();
        }, 100);
      }
    })();

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    });

  } catch (error: any) {
    console.error('[Stream Discovery] Error:', error);
    return new NextResponse(`Error: ${error.message}`, { status: 500 });
  }
} 