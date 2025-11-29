/**
 * Email Layout Helper
 *
 * Provides reusable HTML email scaffolding to DRY up email templates
 */

// Default logo as base64 (small Plugged.in logo)
const DEFAULT_LOGO_BASE64 = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjUwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjx0ZXh0IHg9IjUiIHk9IjM1IiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMzAiIGZpbGw9IiMzMzMiPnBsdWdnZWQuaW48L3RleHQ+PC9zdmc+`;

export interface EmailLayoutOptions {
  title: string;
  appName?: string;
  logoUrl?: string;
}

/**
 * Wraps email body content in a consistent HTML email layout
 *
 * @param bodyContent - The inner HTML content specific to this email (must be valid HTML)
 * @param options - Layout configuration options
 * @returns Complete HTML email ready to send
 */
export function wrapEmailLayout(
  bodyContent: string,
  options: EmailLayoutOptions
): string {
  const { title, appName = 'Plugged.in', logoUrl = DEFAULT_LOGO_BASE64 } = options;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9fafb; color: #111827; line-height: 1.6;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9fafb;">
    <tr>
      <td style="padding: 20px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">

          <!-- Header with Logo -->
          <tr>
            <td style="text-align: center; background-color: #ffffff; padding: 30px 20px; border-bottom: 2px solid #f3f4f6;">
              <img src="${logoUrl}" alt="${appName}" style="height: 50px; max-width: 200px; display: inline-block;" />
            </td>
          </tr>

          <!-- Main Content -->
          ${bodyContent}

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f3f4f6; text-align: center; color: #6b7280; font-size: 14px;">
              <p style="margin: 0 0 10px 0; font-weight: 500; color: #374151;">
                Thanks,<br/>
                The ${appName} Team
              </p>
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #9ca3af;">
                © ${year} ${appName}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Creates a security information box for password-related emails
 *
 * @param ipAddress - IP address where action occurred
 * @param userAgent - User agent string
 * @param timestamp - When the action occurred
 * @returns HTML for security info box
 */
export function createSecurityInfoBox(
  ipAddress: string,
  userAgent: string,
  timestamp: Date
): string {
  const formattedDate = timestamp.toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
  });

  return `
    <div style="background-color: #f3f4f6; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0 0 8px 0; font-weight: 600; color: #1f2937; font-size: 14px;">
        🔒 Security Information
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; font-size: 13px; color: #4b5563;">
        <tr>
          <td style="padding: 4px 0; font-weight: 500; width: 80px;">Date:</td>
          <td style="padding: 4px 0;">${formattedDate}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; font-weight: 500;">IP Address:</td>
          <td style="padding: 4px 0; font-family: monospace;">${ipAddress}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; font-weight: 500;">Device:</td>
          <td style="padding: 4px 0; word-break: break-word;">${userAgent}</td>
        </tr>
      </table>
    </div>`;
}

/**
 * Creates a warning box for unauthorized access notifications
 *
 * @param message - Warning message to display
 * @returns HTML for warning box
 */
export function createWarningBox(message: string): string {
  return `
    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-weight: 600; color: #92400e; font-size: 14px;">
        ⚠️ ${message}
      </p>
    </div>`;
}

/**
 * Creates a primary action button for emails
 *
 * @param url - Target URL for the button
 * @param text - Button text
 * @returns HTML for styled button
 */
export function createActionButton(url: string, text: string): string {
  return `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${url}"
         style="display: inline-block; padding: 12px 30px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
        ${text}
      </a>
    </div>`;
}

/**
 * Creates a list of login methods for password removal emails
 *
 * @param providers - Array of OAuth provider names
 * @returns HTML for provider list
 */
export function createProviderList(providers: string[]): string {
  const listItems = providers
    .map(provider => `<li style="margin: 5px 0;">${provider}</li>`)
    .join('');

  return `
    <div style="margin: 20px 0;">
      <p style="margin: 0 0 10px 0; font-weight: 600; color: #374151;">
        Your remaining login methods:
      </p>
      <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
        ${listItems}
      </ul>
    </div>`;
}
