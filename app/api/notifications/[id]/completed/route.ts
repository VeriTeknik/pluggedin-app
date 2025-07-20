import { NextRequest, NextResponse } from 'next/server';
import { validate as validateUUID } from 'uuid';

import { toggleNotificationCompletedViaAPI } from '@/app/actions/notifications';
import { authenticateApiKey } from '@/app/api/auth';

/**
 * @swagger
 * /api/notifications/{id}/completed:
 *   patch:
 *     summary: Toggle notification completed status
 *     description: Toggles the completed status of a specific notification for the authenticated profile. Used for task-style notifications. Requires API key authentication.
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
 *         description: Notification completed status toggled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 completed:
 *                   type: boolean
 *                   description: The new completed status
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

    // Validate UUID format using library
    if (!validateUUID(notificationId)) {
      return NextResponse.json(
        { error: 'Invalid notification ID format. Please use the UUID from the notification list.' },
        { status: 400 }
      );
    }

    // Toggle the notification completed status
    const result = await toggleNotificationCompletedViaAPI(
      notificationId,
      auth.activeProfile.uuid,
      auth.apiKey?.uuid,
      auth.apiKey?.name || undefined
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
        { error: result.error || 'Failed to toggle notification completed status' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Notification completed status toggled',
    });
  } catch (error) {
    console.error('Error toggling notification completed status:', error);

    return NextResponse.json(
      { error: 'Failed to toggle notification completed status' },
      { status: 500 }
    );
  }
}