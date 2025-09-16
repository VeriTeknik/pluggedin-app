import { sendEmail } from '@/lib/email';

export type AdminNotificationSeverity = 'INFO' | 'WARNING' | 'ALERT' | 'CRITICAL';

export interface AdminNotificationOptions {
  subject: string;
  title: string;
  message: string;
  severity: AdminNotificationSeverity;
  metadata?: Record<string, any>;
  userDetails?: {
    name?: string;
    email?: string;
    id?: string;
    source?: string;
  };
}

/**
 * Get list of admin email addresses from environment variable
 */
export function getAdminEmails(): string[] {
  const adminEmailsEnv = process.env.ADMIN_NOTIFICATION_EMAILS || '';
  return adminEmailsEnv.split(',').map(email => email.trim()).filter(Boolean);
}

/**
 * Check if admin notifications are enabled for a given severity
 */
export function shouldNotifyAdmins(severity: AdminNotificationSeverity): boolean {
  const enabledSeverities = process.env.ADMIN_NOTIFICATION_SEVERITIES || 'ALERT,CRITICAL';
  const severityList = enabledSeverities.split(',').map(s => s.trim());
  return severityList.includes(severity);
}

/**
 * Send notification email to all configured admins
 */
export async function notifyAdmins(options: AdminNotificationOptions): Promise<boolean> {
  const { subject, title, message, severity, metadata, userDetails } = options;

  // Check if we should send notifications for this severity
  if (!shouldNotifyAdmins(severity)) {
    console.log(`Admin notification skipped - severity ${severity} not enabled`);
    return false;
  }

  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) {
    console.warn('No admin emails configured in ADMIN_NOTIFICATION_EMAILS');
    return false;
  }

  const html = generateAdminNotificationHtml({
    title,
    message,
    severity,
    metadata,
    userDetails,
  });

  // Send to all admin recipients
  const emailPromises = adminEmails.map(recipient =>
    sendEmail({
      to: recipient,
      subject: `[${severity}] ${subject}`,
      html,
    })
  );

  try {
    const results = await Promise.allSettled(emailPromises);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
    console.log(`Admin notifications sent to ${successCount}/${adminEmails.length} recipients`);
    return successCount > 0;
  } catch (error) {
    console.error('Failed to send admin notifications:', error);
    return false;
  }
}

/**
 * Generate HTML for admin notification emails
 */
function generateAdminNotificationHtml(options: {
  title: string;
  message: string;
  severity: AdminNotificationSeverity;
  metadata?: Record<string, any>;
  userDetails?: AdminNotificationOptions['userDetails'];
}): string {
  const { title, message, severity, metadata, userDetails } = options;
  
  const severityColors = {
    INFO: { bg: '#3b82f6', text: '#ffffff' },
    WARNING: { bg: '#f59e0b', text: '#ffffff' },
    ALERT: { bg: '#ef4444', text: '#ffffff' },
    CRITICAL: { bg: '#991b1b', text: '#ffffff' },
  };
  
  const colors = severityColors[severity];
  const appName = process.env.EMAIL_FROM_NAME || 'Plugged.in';
  const appUrl = process.env.NEXTAUTH_URL || 'https://plugged.in';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; color: #1f2937;">
      <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="background-color: #f3f4f6; padding: 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
              <!-- Severity Header -->
              <tr>
                <td style="background-color: ${colors.bg}; color: ${colors.text}; padding: 16px 24px; text-align: center;">
                  <h2 style="margin: 0; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                    ${severity} NOTIFICATION
                  </h2>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 24px;">
                  <h1 style="margin: 0 0 16px; color: #1f2937; font-size: 20px; font-weight: 600;">
                    ${title}
                  </h1>
                  
                  <div style="color: #4b5563; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                    ${message}
                  </div>
                  
                  ${userDetails ? `
                    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 20px 0;">
                      <h3 style="margin: 0 0 12px; color: #1f2937; font-size: 14px; font-weight: 600; text-transform: uppercase;">
                        User Details
                      </h3>
                      <table style="width: 100%; font-size: 14px; color: #4b5563;">
                        ${userDetails.name ? `
                          <tr>
                            <td style="padding: 4px 0; font-weight: 600; width: 100px;">Name:</td>
                            <td style="padding: 4px 0;">${userDetails.name}</td>
                          </tr>
                        ` : ''}
                        ${userDetails.email ? `
                          <tr>
                            <td style="padding: 4px 0; font-weight: 600;">Email:</td>
                            <td style="padding: 4px 0;">${userDetails.email}</td>
                          </tr>
                        ` : ''}
                        ${userDetails.id ? `
                          <tr>
                            <td style="padding: 4px 0; font-weight: 600;">User ID:</td>
                            <td style="padding: 4px 0; font-family: monospace; font-size: 12px;">${userDetails.id}</td>
                          </tr>
                        ` : ''}
                        ${userDetails.source ? `
                          <tr>
                            <td style="padding: 4px 0; font-weight: 600;">Source:</td>
                            <td style="padding: 4px 0;">${userDetails.source}</td>
                          </tr>
                        ` : ''}
                      </table>
                    </div>
                  ` : ''}
                  
                  ${metadata && Object.keys(metadata).length > 0 ? `
                    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; margin: 20px 0;">
                      <h3 style="margin: 0 0 12px; color: #1f2937; font-size: 14px; font-weight: 600; text-transform: uppercase;">
                        Additional Information
                      </h3>
                      <pre style="margin: 0; font-family: monospace; font-size: 12px; color: #4b5563; white-space: pre-wrap; word-wrap: break-word;">
${JSON.stringify(metadata, null, 2)}
                      </pre>
                    </div>
                  ` : ''}
                  
                  <!-- Timestamp -->
                  <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; color: #6b7280; font-size: 14px;">
                      Sent at: <strong>${new Date().toLocaleString('en-US', {
                        dateStyle: 'full',
                        timeStyle: 'medium',
                      })}</strong>
                    </p>
                  </div>
                  
                  <!-- Admin Dashboard Link -->
                  <div style="margin-top: 24px; text-align: center;">
                    <a href="${appUrl}/admin" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff; text-decoration: none; font-weight: 600; border-radius: 6px; font-size: 14px;">
                      View Admin Dashboard
                    </a>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0; color: #6b7280; font-size: 12px;">
                    This is an automated admin notification from ${appName}
                  </p>
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

/**
 * Send notification for new user signup
 */
export async function notifyAdminsOfNewUser(user: {
  name: string;
  email: string;
  id?: string;
  source: 'email' | 'google' | 'github' | 'twitter';
}) {
  return notifyAdmins({
    subject: `New User Registration: ${user.name}`,
    title: 'New User Registration',
    message: `A new user has registered on ${process.env.EMAIL_FROM_NAME || 'Plugged.in'}`,
    severity: 'INFO',
    userDetails: {
      name: user.name,
      email: user.email,
      id: user.id,
      source: user.source,
    },
  });
}

/**
 * Send notification for security events
 */
export async function notifyAdminsOfSecurityEvent(event: {
  type: 'failed_login' | 'password_reset' | 'suspicious_activity';
  email?: string;
  ip?: string;
  details: string;
}) {
  const titles = {
    failed_login: 'Failed Login Attempts',
    password_reset: 'Password Reset Request',
    suspicious_activity: 'Suspicious Activity Detected',
  };

  return notifyAdmins({
    subject: titles[event.type],
    title: titles[event.type],
    message: event.details,
    severity: event.type === 'suspicious_activity' ? 'CRITICAL' : 'WARNING',
    metadata: {
      email: event.email,
      ip: event.ip,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Send notification for system errors
 */
export async function notifyAdminsOfSystemError(error: {
  message: string;
  stack?: string;
  context?: string;
}) {
  return notifyAdmins({
    subject: 'System Error Detected',
    title: 'Critical System Error',
    message: error.message,
    severity: 'CRITICAL',
    metadata: {
      context: error.context,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    },
  });
}