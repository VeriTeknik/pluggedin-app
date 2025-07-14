import { NextRequest, NextResponse } from 'next/server';

import { deleteNotification } from '@/app/actions/notifications';
import { authenticateApiKey } from '@/app/api/auth';

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     summary: Delete notification
 *     description: Deletes a specific notification for the authenticated profile. Requires API key authentication.
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
 *         description: Notification deleted successfully
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
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    const notificationId = params.id;
    if (!notificationId) {
      return NextResponse.json(
        { error: 'Notification ID is required' },
        { status: 400 }
      );
    }

    // Delete the notification
    const result = await deleteNotification(
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
        { error: result.error || 'Failed to delete notification' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Notification deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting notification:', error);

    return NextResponse.json(
      { error: 'Failed to delete notification' },
      { status: 500 }
    );
  }
}