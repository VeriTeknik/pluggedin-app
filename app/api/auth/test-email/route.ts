import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { sendEmail } from '@/lib/email';

// Base64 logo for Plugged.in - importing from lib/email.ts
// This is declared here to avoid circular imports
const DEFAULT_LOGO_BASE64 = 'data:image/png;base64,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';

const testEmailSchema = z.object({
  email: z.string().email(),
});

/**
 * @swagger
 * /api/auth/test-email:
 *   post:
 *     summary: Send a test email (Admin Only)
 *     description: |
 *       Sends a pre-formatted test email to the specified address to verify email configuration.
 *       **Requires admin authentication** via a Bearer token matching the `ADMIN_SECRET` environment variable.
 *       **WARNING:** This endpoint is intended for development and testing only and should ideally be disabled or heavily secured in production environments.
 *     tags:
 *       - Authentication
 *       - Admin
 *     security:
 *       - bearerAuth: [] # Define bearerAuth globally or locally if needed
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email address to send the test email to.
 *     responses:
 *       200:
 *         description: Test email sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Test email sent successfully
 *       400:
 *         description: Bad Request - Invalid email address format.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invalid email address
 *                 errors:
 *                   type: array # Zod error details
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized - Missing or invalid admin secret token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Unauthorized. This endpoint requires admin authentication.
 *       500:
 *         description: Internal Server Error - Failed to send the test email (check server logs).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Failed to send test email. Check server logs for details. | Something went wrong
 */
export async function POST(req: NextRequest) {
  try {
    // Check for a secret key to prevent unauthorized access
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.substring(7) !== process.env.ADMIN_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized. This endpoint requires admin authentication.' },
        { status: 401 }
      );
    }
    
    const body = await req.json();
    const { email } = testEmailSchema.parse(body);
    
    const appName = process.env.EMAIL_FROM_NAME || 'Plugged.in';
    
    // Send a test email
    const emailSent = await sendEmail({
      to: email,
      subject: 'Test Email from Plugged.in',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Test Email</title>
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
                <h1 style="margin: 0 0 20px; color: #333; font-size: 24px; text-align: center;">Test Email</h1>
                <p style="margin: 0 0 15px; line-height: 1.6;">This is a test email from your ${appName} application.</p>
                <p style="margin: 0 0 15px; line-height: 1.6;">If you're seeing this, your email configuration is working correctly!</p>
                
                <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 4px; border-left: 4px solid #0070f3;">
                  <h3 style="margin: 0 0 10px; color: #333;">Email Configuration</h3>
                  <ul style="margin: 0; padding-left: 20px; color: #666;">
                    <li style="margin-bottom: 5px;">Host: ${process.env.EMAIL_SERVER_HOST}</li>
                    <li style="margin-bottom: 5px;">Port: ${process.env.EMAIL_SERVER_PORT}</li>
                    <li style="margin-bottom: 5px;">From: ${process.env.EMAIL_FROM}</li>
                    <li style="margin-bottom: 5px;">From Name: ${process.env.EMAIL_FROM_NAME || '(not set)'}</li>
                  </ul>
                </div>
                
                <p style="margin: 20px 0 0; line-height: 1.6;">This email was sent at: <code style="background-color: #f3f4f6; padding: 2px 4px; border-radius: 3px;">${new Date().toISOString()}</code></p>
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
    });
    
    if (emailSent) {
      return NextResponse.json(
        { message: 'Test email sent successfully' },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        { message: 'Failed to send test email. Check server logs for details.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Test email error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid email address', errors: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { message: 'Something went wrong' },
      { status: 500 }
    );
  }
}
