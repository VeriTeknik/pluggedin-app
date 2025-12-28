'use server';

import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { profilesTable, projectsTable, users } from '@/db/schema';
import type { NotificationSeverity, NotificationType } from '@/lib/types/notifications';

import { createNotification } from '@/app/actions/notifications';
import { sendEmail } from '@/lib/email';

interface SendNotificationOptions {
  userId: string; // Can be user.id OR profile_uuid
  title: string;
  message: string;
  type: NotificationType;
  sendEmail?: boolean;
  severity?: NotificationSeverity;
  link?: string;
  expiresInDays?: number;
}

/**
 * Send a notification to a user with optional email delivery.
 *
 * This function:
 * 1. Creates an in-app notification
 * 2. Optionally sends an email notification if sendEmail is true
 *
 * @param userId - Can be either a user.id or profile_uuid. Will resolve to user automatically.
 * @param title - Notification title
 * @param message - Notification message
 * @param type - Notification type (e.g., 'info', 'warning', 'error', 'success')
 * @param sendEmail - Whether to send an email notification (default: false)
 * @param severity - Notification severity level
 * @param link - Optional link for the notification
 * @param expiresInDays - Optional expiration in days
 */
export async function sendNotification({
  userId,
  title,
  message,
  type,
  sendEmail: shouldSendEmail = false,
  severity,
  link,
  expiresInDays,
}: SendNotificationOptions): Promise<{ success: boolean; error?: string }> {
  try {
    // Determine if userId is a profile_uuid or user.id
    let profileUuid: string;
    let userEmail: string | null = null;

    // Check if it's a UUID (profile_uuid format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (uuidRegex.test(userId)) {
      // It's a profile UUID - use it directly
      profileUuid = userId;

      // Get user email for email notification
      if (shouldSendEmail) {
        const profile = await db.query.profilesTable.findFirst({
          where: eq(profilesTable.uuid, profileUuid),
          with: {
            project: {
              with: {
                user: true,
              },
            },
          },
        });

        if (profile?.project?.user?.email) {
          userEmail = profile.project.user.email;
        }
      }
    } else {
      // It's a user.id - need to find their active profile
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      userEmail = user.email;

      // Get the user's first project and active profile
      const project = await db.query.projectsTable.findFirst({
        where: eq(projectsTable.user_id, userId),
        with: {
          activeProfile: true,
        },
      });

      if (!project?.activeProfile) {
        return { success: false, error: 'No active profile found for user' };
      }

      profileUuid = project.activeProfile.uuid;
    }

    // Create in-app notification
    await createNotification({
      profileUuid,
      type,
      title,
      message,
      severity,
      link,
      expiresInDays,
    });

    // Send email notification if requested and we have an email
    if (shouldSendEmail && userEmail) {
      const appName = process.env.EMAIL_FROM_NAME || 'Plugged.in';
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:12005';

      // Determine email styling based on notification type
      const typeColors = {
        info: '#0070f3',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
      };
      const color = typeColors[type] || '#0070f3';

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${title}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; color: #333;">
          <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <tr>
              <td style="padding: 20px 0; text-align: center; background-color: #ffffff; border-radius: 8px 8px 0 0; border-bottom: 2px solid ${color};">
                <h2 style="margin: 0; color: #333; font-size: 20px;">${appName}</h2>
              </td>
            </tr>
            <tr>
              <td style="padding: 40px 30px; background-color: #ffffff;">
                <h1 style="margin: 0 0 20px; color: #333; font-size: 24px;">${title}</h1>
                <div style="background-color: ${color}15; border-left: 4px solid ${color}; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0; line-height: 1.6; color: #333;">${message}</p>
                </div>
                ${link ? `
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${baseUrl}${link}" style="display: inline-block; background-color: ${color}; color: white; text-decoration: none; font-weight: bold; padding: 14px 28px; border-radius: 4px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">View Details</a>
                </div>
                ` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 30px; background-color: #f3f4f6; border-radius: 0 0 8px 8px; text-align: center; color: #666; font-size: 14px;">
                <p style="margin: 0 0 10px;">Thanks,<br>The ${appName} Team</p>
                <p style="margin: 0; font-size: 12px; color: #999;">© ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      await sendEmail({
        to: userEmail,
        subject: title,
        html: emailHtml,
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to send notification:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send notification',
    };
  }
}
