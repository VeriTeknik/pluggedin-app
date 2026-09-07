import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { authenticateApiKey } from '@/app/api/auth';
import { db } from '@/db';
import { mcpActivityTable, McpServerSource,mcpServersTable } from '@/db/schema';
import { analyticsCache } from '@/lib/analytics-cache';
import { createNotification } from '@/lib/notifications-internal';
import type { NotificationMetadata } from '@/lib/types/notifications';

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

    const { action, serverName, serverUuid, externalId, itemName, success, errorMessage, executionTime } = mcpActivitySchema.parse(body);

    // Store all activity in the database for trending calculations
    try {
      // Determine the correct source
      let activitySource = McpServerSource.PLUGGEDIN;
      let activityExternalId: string | null = null;
      let activityServerUuid: string | null = null;
      
      // Check if this is a built-in static tool (not a real server UUID)
      const builtInServerIds = [
        'pluggedin_discovery',
        'pluggedin_discovery_bg',
        'pluggedin_discovery_cache',
        'pluggedin_discovery_cache_error',
        'pluggedin_rag',
        'pluggedin_notifications',
        'pluggedin_proxy',
        'pluggedin_documents',
        'pluggedin_clipboard',
        'Discovery System',
        'Discovery System (Cache)',
        'Discovery System (Background)',
        'Discovery System (Cache Error)',
        'RAG System',
        'Notification System',
        'Proxy System',
        'Document System',
        'Clipboard System',
        'Custom Instructions'
      ];
      
      const isBuiltInTool = serverUuid && builtInServerIds.includes(serverUuid);
      
      if (isBuiltInTool) {
        activityExternalId = serverUuid!;
      } else if (serverUuid || externalId) {
        if (serverUuid && !z.string().uuid().safeParse(serverUuid).success) {
          return NextResponse.json({ error: 'Invalid server UUID' }, { status: 400 });
        }
        const server = await db.query.mcpServersTable.findFirst({
          where: and(
            eq(mcpServersTable.profile_uuid, auth.activeProfile.uuid),
            serverUuid ? eq(mcpServersTable.uuid, serverUuid) : eq(mcpServersTable.external_id, externalId!),
          ),
        });
        if (!server) return NextResponse.json({ error: 'Server not found' }, { status: 404 });
        activityServerUuid = server.uuid;
        activityExternalId = server.external_id;
        activitySource = server.source;
      }

      await db.insert(mcpActivityTable).values({
        profile_uuid: auth.activeProfile.uuid,
        server_uuid: activityServerUuid,
        external_id: activityExternalId,
        source: activitySource,
        action,
        item_name: itemName || null,
      });

      // Invalidate analytics cache for this profile
      analyticsCache.invalidateProfile(auth.activeProfile.uuid);
    } catch (dbError) {
      // Log but don't fail the request if activity tracking fails
      console.error('Failed to store MCP activity:', dbError);
      return NextResponse.json({ error: 'Failed to store activity' }, { status: 500 });
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
      
      const metadata: NotificationMetadata = {
        source: {
          type: 'mcp',
          profileUuid: auth.activeProfile.uuid,
          mcpServer: serverName,
          mcpServerUuid: serverUuid,
          apiKeyId: auth.apiKey?.uuid,
          apiKeyName: auth.apiKey?.name || undefined
        },
        mcpActivity: {
          action,
          itemName,
          success: false,
          errorMessage,
          executionTime
        }
      };

      await createNotification({
        profileUuid: auth.activeProfile.uuid,
        type: 'ALERT',
        title,
        message,
        expiresInDays: 7, // MCP activity notifications expire in 7 days
        metadata
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