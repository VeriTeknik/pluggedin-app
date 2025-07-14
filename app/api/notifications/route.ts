import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getNotifications } from '@/app/actions/notifications';
import { authenticateApiKey } from '@/app/api/auth';

const querySchema = z.object({
  onlyUnread: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .refine((val) => val === undefined || (val > 0 && val <= 100), {
      message: 'Limit must be between 1 and 100',
    }),
});

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: List notifications
 *     description: Retrieves notifications for the authenticated profile. Requires API key authentication.
 *     tags:
 *       - Notifications
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: query
 *         name: onlyUnread
 *         schema:
 *           type: boolean
 *         description: Filter to show only unread notifications
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Limit the number of notifications returned (max 100)
 *     responses:
 *       200:
 *         description: List of notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 notifications:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [SYSTEM, ALERT, INFO, SUCCESS, WARNING, CUSTOM]
 *                       title:
 *                         type: string
 *                       message:
 *                         type: string
 *                       severity:
 *                         type: string
 *                         enum: [INFO, SUCCESS, WARNING, ALERT]
 *                       read:
 *                         type: boolean
 *                       completed:
 *                         type: boolean
 *                       link:
 *                         type: string
 *                         nullable: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       expires_at:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *       400:
 *         description: Bad Request - Invalid query parameters
 *       401:
 *         description: Unauthorized - Invalid API key
 *       500:
 *         description: Internal Server Error
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    // Parse and validate query parameters
    const searchParams = request.nextUrl.searchParams;
    const queryParams = {
      onlyUnread: searchParams.get('onlyUnread'),
      limit: searchParams.get('limit'),
    };

    const validatedParams = querySchema.parse(queryParams);

    // Get notifications from the database
    const result = await getNotifications(
      auth.activeProfile.uuid,
      validatedParams.onlyUnread
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to fetch notifications' },
        { status: 500 }
      );
    }

    // Apply limit if specified
    let notifications = result.notifications || [];
    if (validatedParams.limit) {
      notifications = notifications.slice(0, validatedParams.limit);
    }

    return NextResponse.json({
      success: true,
      notifications,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}