import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { authenticateApiKey } from '@/app/api/auth';
import { db } from '@/db';
import { mcpServersTable, ToggleStatus,toolsTable } from '@/db/schema';
import { decryptServerData } from '@/lib/encryption';
import { listToolsFromServer } from '@/lib/mcp/client-wrapper';

interface StreamMessage {
  type: 'log' | 'progress' | 'error' | 'complete';
  message: string;
  timestamp: number;
  data?: any;
}

function createSSEResponse() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController;
  
  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  const sendMessage = (message: StreamMessage) => {
    const data = `data: ${JSON.stringify(message)}\n\n`;
    controller.enqueue(encoder.encode(data));
  };

  const close = () => {
    controller.close();
  };

  return { stream, sendMessage, close };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serverUuid: string }> }
) {
  try {
    const { serverUuid } = await params;
    
    // Authenticate API key and get active profile
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;
    const profileUuid = auth.activeProfile.uuid;

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
        const discoveredTemplates: any[] = [];
        const discoveredResources: any[] = [];
        const discoveredPrompts: any[] = [];

        // Discover Tools
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

          if (discoveredTools.length > 0) {
            // Delete existing tools
            sendMessage({
              type: 'log',
              message: `Deleting old tools for server: ${serverUuid}`,
              timestamp: Date.now(),
            });
            
            await db.delete(toolsTable).where(eq(toolsTable.mcp_server_uuid, serverUuid));

            // Insert new tools
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
          sendMessage({
            type: 'error',
            message: `Failed to discover/store tools: ${error.message}`,
            timestamp: Date.now(),
          });
        }

        // TODO: Add similar streaming for resource templates, static resources, and prompts
        // For now, we'll just complete the tools discovery

        sendMessage({
          type: 'complete',
          message: `Discovery completed successfully for ${serverConfig.name || serverUuid}`,
          timestamp: Date.now(),
          data: {
            tools: discoveredTools.length,
            templates: discoveredTemplates.length,
            resources: discoveredResources.length,
            prompts: discoveredPrompts.length,
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