import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createNotification } from '@/app/actions/notifications';
import { authenticateApiKey } from '@/app/api/auth';
import { sendEmail as sendEmailHelper } from '@/lib/email';
import type { NotificationMetadata } from '@/lib/types/notifications';

const customNotificationSchema = z.object({
  title: z.string().optional(),
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
 *             properties:
 *               title:
 *                 type: string
 *                 description: Optional notification title. If not provided, a localized default will be used.
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
    const { title: providedTitle, message, severity, sendEmail } = customNotificationSchema.parse(body);

    // Create the notification in the database
    // Use provided title or default English title (localization handled by UI)
    const title = providedTitle || "Custom notification";
    
    const metadata: NotificationMetadata = {
      source: {
        type: 'api',
        profileUuid: auth.activeProfile.uuid,
        apiKeyId: auth.apiKey?.id,
        apiKeyName: auth.apiKey?.name
      },
      task: {
        priority: severity === 'ALERT' ? 'high' : severity === 'WARNING' ? 'medium' : 'low'
      }
    };

    await createNotification({
      profileUuid: auth.activeProfile.uuid,
      type: 'CUSTOM', // Always use CUSTOM type for custom notifications
      title,
      message,
      severity, // Pass the severity for MCP notifications
      expiresInDays: 30, // Custom notifications expire in 30 days
      metadata
    });

    let emailSent = false;
    
    // Send email if requested
    if (sendEmail) {
      try {
        // Get user email from the profile/project
        const userEmail = await getUserEmailFromProfile(auth.activeProfile.uuid);
        
        if (userEmail) {
          const emailHtml = await generateCustomNotificationEmail(title, message, severity);
          const emailResult = await sendEmailHelper({
            to: userEmail,
            subject: `${title} - Plugged.in`,
            html: emailHtml,
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
 * Generate HTML email for custom notifications with markdown support
 */
async function generateCustomNotificationEmail(title: string, message: string, severity: string): Promise<string> {
  const { marked } = await import('marked');
  
  // Configure marked for email-safe HTML
  marked.setOptions({
    breaks: true,
    gfm: true,
  });
  
  // Convert markdown to HTML
  const htmlMessage = await marked(message);
  
  const severityColors = {
    INFO: { primary: '#3b82f6', light: '#dbeafe', dark: '#1e40af' },
    SUCCESS: { primary: '#10b981', light: '#d1fae5', dark: '#047857' }, 
    WARNING: { primary: '#f59e0b', light: '#fef3c7', dark: '#b45309' },
    ALERT: { primary: '#ef4444', light: '#fee2e2', dark: '#b91c1c' },
  };
  
  const colors = severityColors[severity as keyof typeof severityColors] || { 
    primary: '#6b7280', 
    light: '#f3f4f6', 
    dark: '#374151' 
  };
  
  const appName = process.env.EMAIL_FROM_NAME || 'Plugged.in';
  const appUrl = process.env.NEXTAUTH_URL || 'https://pluggedin.com';
  
  // Severity icons as inline SVG
  const severityIcons = {
    INFO: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 16V12M12 8H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    SUCCESS: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    WARNING: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.29 3.86L1.82 18C1.64 18.32 1.55 18.68 1.55 19.05C1.55 20.12 2.38 21 3.45 21H20.55C21.62 21 22.45 20.12 22.45 19.05C22.45 18.68 22.36 18.32 22.18 18L13.71 3.86C13.3 3.17 12.55 2.75 11.73 2.75C10.91 2.75 10.16 3.17 9.75 3.86H10.29Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 9V13M12 17H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ALERT: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 8V12M12 16H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  
  const icon = severityIcons[severity as keyof typeof severityIcons] || severityIcons.INFO;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <!--[if mso]>
      <noscript>
        <xml>
          <o:OfficeDocumentSettings>
            <o:PixelsPerInch>96</o:PixelsPerInch>
          </o:OfficeDocumentSettings>
        </xml>
      </noscript>
      <![endif]-->
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #1e293b; -webkit-font-smoothing: antialiased;">
      <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="background-color: #f8fafc; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden;">
              <!-- Header with gradient -->
              <tr>
                <td style="background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.dark} 100%); padding: 32px; text-align: center;">
                  <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
                    <tr>
                      <td align="center">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                          ${appName}
                        </h1>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              
              <!-- Severity Badge -->
              <tr>
                <td style="padding: 0 32px;">
                  <div style="margin-top: -24px; margin-bottom: 24px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="background-color: ${colors.light}; border-radius: 8px; overflow: hidden;">
                      <tr>
                        <td style="padding: 12px 20px;">
                          <table role="presentation" cellspacing="0" cellpadding="0">
                            <tr>
                              <td style="color: ${colors.primary}; vertical-align: middle; padding-right: 8px;">
                                ${icon}
                              </td>
                              <td style="color: ${colors.dark}; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; vertical-align: middle;">
                                ${severity}
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 0 32px 32px;">
                  <!-- Title -->
                  <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 24px; font-weight: 600; line-height: 1.25;">
                    ${title}
                  </h2>
                  
                  <!-- Message with markdown styles -->
                  <div style="color: #475569; font-size: 16px; line-height: 1.6;">
                    <style>
                      .email-content p { margin: 0 0 16px; }
                      .email-content p:last-child { margin-bottom: 0; }
                      .email-content ul, .email-content ol { margin: 0 0 16px; padding-left: 24px; }
                      .email-content li { margin-bottom: 8px; }
                      .email-content a { color: ${colors.primary}; text-decoration: none; font-weight: 500; }
                      .email-content a:hover { text-decoration: underline; }
                      .email-content code { background-color: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 14px; }
                      .email-content pre { background-color: #f1f5f9; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 0 0 16px; }
                      .email-content pre code { background-color: transparent; padding: 0; }
                      .email-content strong { font-weight: 600; color: #1e293b; }
                      .email-content em { font-style: italic; }
                      .email-content h1, .email-content h2, .email-content h3 { color: #1e293b; margin: 24px 0 12px; font-weight: 600; }
                      .email-content h1 { font-size: 20px; }
                      .email-content h2 { font-size: 18px; }
                      .email-content h3 { font-size: 16px; }
                      .email-content blockquote { border-left: 4px solid #e2e8f0; padding-left: 16px; margin: 16px 0; color: #64748b; font-style: italic; }
                      .email-content hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
                      .email-content table { width: 100%; border-collapse: collapse; margin: 16px 0; }
                      .email-content th, .email-content td { padding: 8px 12px; text-align: left; border: 1px solid #e2e8f0; }
                      .email-content th { background-color: #f8fafc; font-weight: 600; }
                    </style>
                    <div class="email-content">
                      ${htmlMessage}
                    </div>
                  </div>
                  
                  <!-- Timestamp -->
                  <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0; color: #64748b; font-size: 14px;">
                      Sent on <strong>${new Date().toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}</strong> at <strong>${new Date().toLocaleTimeString('en-US', { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        hour12: true 
                      })}</strong>
                    </p>
                  </div>
                  
                  <!-- Call to Action -->
                  <div style="margin-top: 32px; text-align: center;">
                    <a href="${appUrl}/notifications" style="display: inline-block; padding: 12px 24px; background-color: ${colors.primary}; color: #ffffff; text-decoration: none; font-weight: 600; border-radius: 8px; font-size: 16px;">
                      View All Notifications
                    </a>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; padding: 32px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 8px; color: #64748b; font-size: 14px;">
                    Thanks for using ${appName}!
                  </p>
                  <p style="margin: 0 0 16px; color: #94a3b8; font-size: 12px;">
                    © ${new Date().getFullYear()} ${appName}. All rights reserved.
                  </p>
                  
                  <!-- Social Links (optional) -->
                  <table role="presentation" cellspacing="0" cellpadding="0" align="center">
                    <tr>
                      <td style="padding: 0 8px;">
                        <a href="${appUrl}" style="color: #94a3b8; text-decoration: none; font-size: 12px;">
                          Website
                        </a>
                      </td>
                      <td style="color: #cbd5e1;">•</td>
                      <td style="padding: 0 8px;">
                        <a href="${appUrl}/docs" style="color: #94a3b8; text-decoration: none; font-size: 12px;">
                          Documentation
                        </a>
                      </td>
                      <td style="color: #cbd5e1;">•</td>
                      <td style="padding: 0 8px;">
                        <a href="${appUrl}/support" style="color: #94a3b8; text-decoration: none; font-size: 12px;">
                          Support
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
} 