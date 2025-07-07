import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createNotification } from '@/app/actions/notifications';
import { authenticateApiKey } from '@/app/api/auth';
import { analytics } from '@/lib/analytics/analytics-service';

const mcpActivitySchema = z.object({
  action: z.enum(['tool_call', 'prompt_get', 'resource_read']),
  serverName: z.string(),
  serverUuid: z.string(),
  itemName: z.string(), // tool name, prompt name, or resource URI
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
 *               - serverUuid
 *               - itemName
 *               - success
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [tool_call, prompt_get, resource_read]
 *               serverName:
 *                 type: string
 *               serverUuid:
 *                 type: string
 *               itemName:
 *                 type: string
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

    const body = await request.json();
    const { action, serverName, serverUuid, itemName, success, errorMessage, executionTime } = mcpActivitySchema.parse(body);

    // Forward ALL MCP activity to analytics service
    try {
      if (success) {
        // Track successful usage
        await analytics.track({
          type: 'usage',
          serverId: serverUuid,
          userId: auth.user?.id || 'anonymous',
          toolName: itemName, // This will be tool name, prompt name, or resource URI
          duration: executionTime || 0,
          success: true,
          metadata: {
            source: 'mcp-proxy',
            profileId: auth.activeProfile.uuid,
            projectId: auth.activeProfile.project_uuid,
            serverName,
            action, // Include the original action type
            sessionId: `mcp-${auth.activeProfile.uuid}-${Date.now()}`, // Generate session ID
            itemType: action, // tool_call, prompt_get, or resource_read
          },
        });
      } else {
        // Track error
        await analytics.track({
          type: 'error',
          serverId: serverUuid,
          userId: auth.user?.id || 'anonymous',
          error: errorMessage || 'Unknown error',
          context: action, // Required context field
          metadata: {
            source: 'mcp-proxy',
            profileId: auth.activeProfile.uuid,
            projectId: auth.activeProfile.project_uuid,
            serverName,
            toolName: itemName, // Include tool name in metadata instead
            action,
            sessionId: `mcp-${auth.activeProfile.uuid}-${Date.now()}`,
            itemType: action,
          },
        });
      }
    } catch (analyticsError) {
      // Don't fail the request if analytics fails
      console.error('Failed to track analytics:', analyticsError);
    }

    // Only create local notifications for errors or important events
    if (!success) {
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