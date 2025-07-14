import { NextRequest, NextResponse } from 'next/server';

import { markNotificationAsRead } from '@/app/actions/notifications';
import { authenticateApiKey } from '@/app/api/auth';

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Mark notification as read
 *     description: Marks a specific notification as read for the authenticated profile. Requires API key authentication.
 *     tags:
 *       - Notifications
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The notification ID
 *     responses:
 *       200:
 *         description: Notification marked as read successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized - Invalid API key
 *       404:
 *         description: Not Found - Notification not found or not accessible
 *       500:
 *         description: Internal Server Error
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    const { id: notificationId } = await params;
    if (!notificationId) {
      return NextResponse.json(
        { error: 'Notification ID is required' },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(notificationId)) {
      return NextResponse.json(
        { error: 'Invalid notification ID format. Please use the UUID from the notification list.' },
        { status: 400 }
      );
    }

    // Mark the notification as read
    const result = await markNotificationAsRead(
      notificationId,
      auth.activeProfile.uuid
    );

    if (!result.success) {
      // Check if it's a not found error
      if (result.error?.includes('not found')) {
        return NextResponse.json(
          { error: 'Notification not found or not accessible' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: result.error || 'Failed to mark notification as read' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Notification marked as read',
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);

    return NextResponse.json(
      { error: 'Failed to mark notification as read' },
      { status: 500 }
    );
  }
}