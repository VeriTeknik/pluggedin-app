import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { mcpServersTable, profilesTable, ToggleStatus, toolsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
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