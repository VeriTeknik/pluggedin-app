import nodemailer from 'nodemailer';

type EmailOptions = {
  to: string;
  subject: string;
  html: string;
};

// Base64 logo for Plugged.in - a simple blue placeholder
// This is a light blue rounded rectangle with "Plugged.in" text
// Replace this with your actual logo encoded in base64
const DEFAULT_LOGO_BASE64 = 'data:image/png;base64,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';

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