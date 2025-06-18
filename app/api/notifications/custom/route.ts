import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createNotification } from '@/app/actions/notifications';
import { authenticateApiKey } from '@/app/api/auth';
import { sendEmail as sendEmailHelper } from '@/lib/email';

const customNotificationSchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
  severity: z.enum(['INFO', 'SUCCESS', 'WARNING', 'ALERT']).default('INFO'),
  sendEmail: z.boolean().optional().default(false),
});

/**
 * @swagger
 * /api/notifications/custom:
 *   post:
 *     summary: Send custom notifications
 *     description: Creates custom notifications in the system with optional email delivery. Requires API key authentication.
 *     tags:
 *       - Notifications
 *       - Custom
 *     security:
 *       - apiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - severity
 *             properties:
 *               message:
 *                 type: string
 *                 description: The notification message content
 *                 minLength: 1
 *               severity:
 *                 type: string
 *                 enum: [INFO, SUCCESS, WARNING, ALERT]
 *                 description: The severity level of the notification
 *               sendEmail:
 *                 type: boolean
 *                 description: Whether to also send the notification via email
 *                 default: false
 *     responses:
 *       200:
 *         description: Notification sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 emailSent:
 *                   type: boolean
 *                   description: Whether email was sent (only present if sendEmail was true)
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
    const { message, severity, sendEmail } = customNotificationSchema.parse(body);

    // Create the notification in the database
    const title = `Custom notification`;
    
    await createNotification({
      profileUuid: auth.activeProfile.uuid,
      type: 'CUSTOM', // Always use CUSTOM type for custom notifications
      title,
      message,
      expiresInDays: 30, // Custom notifications expire in 30 days
    });

    let emailSent = false;
    
    // Send email if requested
    if (sendEmail) {
      try {
        // Get user email from the profile/project
        const userEmail = await getUserEmailFromProfile(auth.activeProfile.uuid);
        
        if (userEmail) {
          const emailResult = await sendEmailHelper({
            to: userEmail,
            subject: `${title} - Plugged.in`,
            html: generateCustomNotificationEmail(title, message, severity),
          });
          
          emailSent = !!emailResult;
        }
      } catch (emailError) {
        // Log email error but don't fail the request
        console.error('Failed to send notification email:', emailError);
      }
    }

    const responseMessage = sendEmail 
      ? `Notification created${emailSent ? ' and email sent' : ' (email failed)'}`
      : 'Notification created successfully';

    const response: any = {
      success: true,
      message: responseMessage,
    };

    if (sendEmail) {
      response.emailSent = emailSent;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error creating custom notification:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create custom notification' },
      { status: 500 }
    );
  }
}

/**
 * Get user email from profile UUID
 */
async function getUserEmailFromProfile(profileUuid: string): Promise<string | null> {
  try {
    const { db } = await import('@/db');
    const { profilesTable, projectsTable, users } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    
    // Get profile, then project, then user email
    const result = await db
      .select({ email: users.email })
      .from(profilesTable)
      .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
      .innerJoin(users, eq(projectsTable.user_id, users.id))
      .where(eq(profilesTable.uuid, profileUuid))
      .limit(1);
    
    return result[0]?.email || null;
  } catch (error) {
    console.error('Error getting user email from profile:', error);
    return null;
  }
}

/**
 * Generate HTML email for custom notifications
 */
function generateCustomNotificationEmail(title: string, message: string, severity: string): string {
  const severityColors = {
    INFO: '#3b82f6',
    SUCCESS: '#10b981', 
    WARNING: '#f59e0b',
    ALERT: '#ef4444',
  };
  
  const severityColor = severityColors[severity as keyof typeof severityColors] || '#6b7280';
  const appName = process.env.EMAIL_FROM_NAME || 'Plugged.in';
  
  return `
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
          <td style="padding: 20px 0; text-align: center; background-color: #ffffff; border-radius: 8px 8px 0 0; border-bottom: 2px solid #f0f0f0;">
            <h1 style="margin: 0; color: #333; font-size: 24px;">${appName}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding: 40px 30px; background-color: #ffffff;">
            <div style="margin-bottom: 20px; padding: 15px; border-radius: 4px; border-left: 4px solid ${severityColor}; background-color: ${severityColor}10;">
              <h2 style="margin: 0 0 10px; color: ${severityColor}; font-size: 18px; text-transform: uppercase; font-weight: bold;">
                ${severity}
              </h2>
              <h3 style="margin: 0 0 15px; color: #333; font-size: 16px;">
                ${title}
              </h3>
              <p style="margin: 0; line-height: 1.6; color: #555;">
                ${message}
              </p>
            </div>
            
            <p style="margin: 20px 0 0; line-height: 1.6; font-size: 14px; color: #666;">
              This notification was sent at: <code style="background-color: #f3f4f6; padding: 2px 4px; border-radius: 3px;">${new Date().toLocaleString()}</code>
            </p>
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
} 