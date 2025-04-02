import nodemailer from 'nodemailer';

type EmailOptions = {
  to: string;
  subject: string;
  html: string;
};

// Base64 logo for Plugged.in - a simple blue placeholder
// This is a light blue rounded rectangle with "Plugged.in" text
// Replace this with your actual logo encoded in base64
const DEFAULT_LOGO_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASAAAABICAYAAABWUygDAAAACXBIWXMAAC4jAAAuIwF4pT92AAAE7mlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgOS4xLWMwMDIgNzkuYjdjNjRjYywgMjAyNC8wNy8xNi0wNzo1OTo0MCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0RXZ0PSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VFdmVudCMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIDI2LjAgKFdpbmRvd3MpIiB4bXA6Q3JlYXRlRGF0ZT0iMjAyNC0xMC0yNFQwMToxMzo1NiswMzowMCIgeG1wOk1vZGlmeURhdGU9IjIwMjQtMTAtMjVUMTY6MTg6MDkrMDM6MDAiIHhtcDpNZXRhZGF0YURhdGU9IjIwMjQtMTAtMjVUMTY6MTg6MDkrMDM6MDAiIGRjOmZvcm1hdD0iaW1hZ2UvcG5nIiBwaG90b3Nob3A6Q29sb3JNb2RlPSIzIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOjVlODQ0MzNiLTVhZjctNzg0Ni05ZTVlLTc2Zjk2MDBiNTE1YyIgeG1wTU06RG9jdW1lbnRJRD0i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';

/**
 * Send an email using Nodemailer
 */
export async function sendEmail({ to, subject, html }: EmailOptions) {
  const { 
    EMAIL_SERVER_HOST, 
    EMAIL_SERVER_PORT, 
    EMAIL_SERVER_USER, 
    EMAIL_SERVER_PASSWORD, 
    EMAIL_FROM,
    EMAIL_FROM_NAME
  } = process.env;

  // Check if email configuration exists
  if (!EMAIL_SERVER_HOST || !EMAIL_SERVER_USER || !EMAIL_SERVER_PASSWORD || !EMAIL_FROM) {
    console.warn('Email sending is not configured. Please set the required environment variables.');
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: EMAIL_SERVER_HOST,
    port: parseInt(EMAIL_SERVER_PORT || '587'),
    secure: parseInt(EMAIL_SERVER_PORT || '587') === 465, // true for 465, false for other ports
    auth: {
      user: EMAIL_SERVER_USER,
      pass: EMAIL_SERVER_PASSWORD,
    },
  });

  try {
    // Format sender with name if available
    const from = EMAIL_FROM_NAME 
      ? `"${EMAIL_FROM_NAME}" <${EMAIL_FROM}>`
      : EMAIL_FROM;

    await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

/**
 * Generate a password reset email
 */
export function generatePasswordResetEmail(email: string, token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:12005';
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  const appName = process.env.EMAIL_FROM_NAME || 'Plugged.in';
  
  return {
    to: email,
    subject: 'Reset your password',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; color: #333;">
        <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <tr>
            <td style="padding: 20px 0; text-align: center; background-color: #ffffff; border-radius: 8px 8px 0 0; border-bottom: 2px solid #f0f0f0;">
              <img src="${DEFAULT_LOGO_BASE64}" alt="${appName}" style="height: 50px; max-width: 150px;">
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px; background-color: #ffffff;">
              <h1 style="margin: 0 0 20px; color: #333; font-size: 24px; text-align: center;">Reset Your Password</h1>
              <p style="margin: 0 0 15px; line-height: 1.6;">Hello,</p>
              <p style="margin: 0 0 20px; line-height: 1.6;">We received a request to reset your password. Click the button below to create a new password:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="display: inline-block; background-color: #0070f3; color: white; text-decoration: none; font-weight: bold; padding: 14px 28px; border-radius: 4px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">Reset Password</a>
              </div>
              <p style="margin: 0 0 10px; line-height: 1.6; font-size: 14px; color: #666;">This link will expire in 2 hours for security reasons.</p>
              <p style="margin: 0 0 10px; line-height: 1.6; font-size: 14px; color: #666;">If you didn't request this password reset, you can safely ignore this email.</p>
              <p style="margin: 30px 0 10px; line-height: 1.6; color: #666; border-top: 1px solid #f0f0f0; padding-top: 20px;">
                If the button doesn't work, copy and paste this URL into your browser:
              </p>
              <p style="margin: 0 0 20px; line-height: 1.6; font-size: 12px; color: #999; word-break: break-all;">
                ${resetUrl}
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
    `,
  };
}

/**
 * Generate an email verification email
 */
export function generateVerificationEmail(email: string, token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:12005';
  const verifyUrl = `${baseUrl}/verify-email?token=${token}`;
  const appName = process.env.EMAIL_FROM_NAME || 'Plugged.in';
  
  return {
    to: email,
    subject: 'Verify your email address',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; color: #333;">
        <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <tr>
            <td style="padding: 20px 0; text-align: center; background-color: #ffffff; border-radius: 8px 8px 0 0; border-bottom: 2px solid #f0f0f0;">
              <img src="${DEFAULT_LOGO_BASE64}" alt="${appName}" style="height: 50px; max-width: 150px;">
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px; background-color: #ffffff;">
              <h1 style="margin: 0 0 20px; color: #333; font-size: 24px; text-align: center;">Verify Your Email</h1>
              <p style="margin: 0 0 15px; line-height: 1.6;">Hello,</p>
              <p style="margin: 0 0 20px; line-height: 1.6;">Thank you for registering! Please click the button below to verify your email address:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verifyUrl}" style="display: inline-block; background-color: #0070f3; color: white; text-decoration: none; font-weight: bold; padding: 14px 28px; border-radius: 4px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">Verify Email</a>
              </div>
              <p style="margin: 0 0 10px; line-height: 1.6; font-size: 14px; color: #666;">This link will expire in 24 hours for security reasons.</p>
              <p style="margin: 0 0 10px; line-height: 1.6; font-size: 14px; color: #666;">If you didn't create an account with us, you can safely ignore this email.</p>
              <p style="margin: 30px 0 10px; line-height: 1.6; color: #666; border-top: 1px solid #f0f0f0; padding-top: 20px;">
                If the button doesn't work, copy and paste this URL into your browser:
              </p>
              <p style="margin: 0 0 20px; line-height: 1.6; font-size: 12px; color: #999; word-break: break-all;">
                ${verifyUrl}
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
    `,
  };
} 