import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createNotification } from '@/app/actions/notifications';
import { authenticateApiKey } from '@/app/api/auth';
import { db } from '@/db';
import { mcpActivityTable, McpServerSource } from '@/db/schema';

const mcpActivitySchema = z.object({
  action: z.enum(['tool_call', 'prompt_get', 'resource_read', 'install', 'uninstall']),
  serverName: z.string(),
  serverUuid: z.string().optional(), // Optional for registry servers
  externalId: z.string().optional(), // For registry servers
  source: z.enum(['REGISTRY', 'COMMUNITY']).optional(), // Server source
  itemName: z.string().optional(), // tool name, prompt name, or resource URI (not needed for install/uninstall)
  success: z.boolean(),
  errorMessage: z.string().optional(),
  executionTime: z.number().optional(), // in milliseconds
});

/**
 * @swagger
 * /api/notifications/mcp-activity:
 *   post:
 *     summary: Log MCP server activity notifications
 *     description: Creates notifications for MCP server activities (tool calls, prompt gets, resource reads) from the MCP proxy. Requires API key authentication.
 *     tags:
 *       - Notifications
 *       - MCP Activity
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *               - serverName
 *               - success
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [tool_call, prompt_get, resource_read, install, uninstall]
 *               serverName:
 *                 type: string
 *               serverUuid:
 *                 type: string
 *                 description: UUID for local servers
 *               externalId:
 *                 type: string
 *                 description: External ID for registry servers
 *               source:
 *                 type: string
 *                 enum: [REGISTRY, COMMUNITY]
 *                 description: Server source type
 *               itemName:
 *                 type: string
 *                 description: Name of tool/resource/prompt (not needed for install/uninstall)
 *               success:
 *                 type: boolean
 *               errorMessage:
 *                 type: string
 *               executionTime:
 *                 type: number
 *     responses:
 *       200:
 *         description: Notification logged successfully
 *       400:
 *         description: Bad Request - Invalid input
 *       401:
 *         description: Unauthorized - Invalid API key
 *       500:
 *         description: Internal Server Error
 */
export async function POST(request: Request) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    // Parse JSON with error handling
    let body;
    try {
      body = await request.json();
    } catch (error) {
      console.error('Failed to parse JSON:', error);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const { action, serverName, serverUuid, externalId, source, itemName, success, errorMessage, executionTime } = mcpActivitySchema.parse(body);

    // Store all activity in the database for trending calculations
    try {
      // Determine the correct source
      let activitySource = source;
      
      // Check if this is a built-in static tool (not a real server UUID)
      const builtInServerIds = [
        'pluggedin_discovery',
        'pluggedin_discovery_bg',
        'pluggedin_discovery_cache',
        'pluggedin_discovery_cache_error',
        'pluggedin_rag',
        'pluggedin_notifications',
        'pluggedin_proxy',
        'Discovery System',
        'Discovery System (Cache)',
        'Discovery System (Background)',
        'Discovery System (Cache Error)',
        'RAG System',
        'Notification System',
        'Proxy System',
        'Custom Instructions'
      ];
      
      const isBuiltInTool = serverUuid && builtInServerIds.includes(serverUuid);
      
      if (!activitySource && serverUuid && !isBuiltInTool) {
        // Look up the server to get its actual source (only for real UUIDs)
        const { mcpServersTable } = await import('@/db/schema');
        const { eq } = await import('drizzle-orm');
        
        const server = await db.query.mcpServersTable.findFirst({
          where: eq(mcpServersTable.uuid, serverUuid)
        });
        
        if (server) {
          // Map PLUGGEDIN source to COMMUNITY for activity tracking
          activitySource = server.source === McpServerSource.REGISTRY ? 'REGISTRY' : 'COMMUNITY';
          // Also use the external_id if available
          if (server.external_id && !externalId) {
            await db.insert(mcpActivityTable).values({
              profile_uuid: auth.activeProfile.uuid,
              server_uuid: serverUuid,
              external_id: server.external_id,
              source: activitySource,
              action,
              item_name: itemName || null,
            });
            return NextResponse.json({ success: true });
          }
        }
      }
      
      await db.insert(mcpActivityTable).values({
        profile_uuid: auth.activeProfile.uuid,
        server_uuid: (serverUuid && !isBuiltInTool) ? serverUuid : null,
        external_id: externalId || null,
        source: activitySource || McpServerSource.PLUGGEDIN,
        action,
        item_name: itemName || null,
      });
    } catch (dbError) {
      // Log but don't fail the request if activity tracking fails
      console.error('Failed to store MCP activity:', dbError);
    }

    // Only create local notifications for errors or important events
    if (!success && ['tool_call', 'prompt_get', 'resource_read'].includes(action)) {
      let title: string;
      let message: string;
      
      switch (action) {
        case 'tool_call':
          title = `Tool execution failed`;
          message = `Tool "${itemName}" from ${serverName} failed${errorMessage ? ': ' + errorMessage : ''}`;
          break;
        case 'prompt_get':
          title = `Prompt retrieval failed`;
          message = `Prompt "${itemName}" from ${serverName} failed${errorMessage ? ': ' + errorMessage : ''}`;
          break;
        case 'resource_read':
          title = `Resource read failed`;
          message = `Resource "${itemName}" from ${serverName} failed${errorMessage ? ': ' + errorMessage : ''}`;
          break;
        default:
          title = `Operation failed`;
          message = `Operation "${itemName}" from ${serverName} failed${errorMessage ? ': ' + errorMessage : ''}`;
      }
      
      if (executionTime) {
        message += ` (${executionTime}ms)`;
      }
      
      await createNotification({
        profileUuid: auth.activeProfile.uuid,
        type: 'ALERT',
        title,
        message,
        expiresInDays: 7, // MCP activity notifications expire in 7 days
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error logging MCP activity notification:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to log MCP activity notification' },
      { status: 500 }
    );
  }
} 