# Email Testing Guide

This guide explains how to test email functionality in the application using [Mailtrap](https://mailtrap.io), a service that allows you to safely test email sending without actually delivering emails to real recipients.

## Setting Up Mailtrap

1. Sign up for a free account at [Mailtrap.io](https://mailtrap.io)
2. After signing in, navigate to the "Inboxes" section
3. Create a new inbox or use the default one
4. Click on the inbox to view its settings
5. Look for the "SMTP Settings" section
6. Select "Nodemailer" from the integration dropdown

You'll see credentials that look something like this:

```javascript
const transport = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
  port: 2525,
  auth: {
    user: "your-username",
    pass: "your-password"
  }
});
```

## Configuring Your Application

1. Copy the `.env.local.example` file to `.env.local`:
   ```
   cp .env.local.example .env.local
   ```

2. Update the email configuration in `.env.local` with your Mailtrap credentials:
   ```
   EMAIL_SERVER_HOST=sandbox.smtp.mailtrap.io
   EMAIL_SERVER_PORT=2525
   EMAIL_SERVER_USER=your-mailtrap-username
   EMAIL_SERVER_PASSWORD=your-mailtrap-password
   EMAIL_FROM=noreply@pluggedin.app
   EMAIL_FROM_NAME=Plugged.in
   ```

   > **Important:** Make sure to set the `EMAIL_FROM_NAME` variable. This will appear as the sender name in emails (e.g., "Plugged.in <noreply@pluggedin.app>").

3. Also set an admin secret for testing purposes:
   ```
   ADMIN_SECRET=your-secret-key
   ```

4. Save the `.env.local` file and restart your development server:
   ```
   pnpm dev
   ```

## Testing Email Functionality

You can test the email functionality in several ways:

### Using the Application Forms

1. **Password Reset**: Visit `/forgot-password` and enter an email address
2. **User Registration**: Visit `/register` and create a new account

### Using the Test Endpoint

For direct testing of the email delivery system, use the test endpoint:

```bash
curl -X POST \
  http://localhost:12005/api/auth/test-email \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-admin-secret-key' \
  -d '{"email": "your-test-email@example.com"}'
```

Replace `your-admin-secret-key` with the value you set for `ADMIN_SECRET` in your `.env.local` file.

All emails will be captured by Mailtrap and will appear in your Mailtrap inbox. You can view the email content, HTML structure, spam analysis, and more.

## About the Email Templates

The application uses responsive HTML email templates that are compatible with most email clients. The templates include:

1. **Verification Email**: Sent when a user registers to verify their email address
2. **Password Reset Email**: Sent when a user requests a password reset
3. **Test Email**: Sent through the test endpoint to verify email configuration

All emails include:
- A header with the application logo (embedded as base64)
- A main content section with clear instructions
- A call-to-action button for the primary action
- A fallback URL for cases where the button doesn't work
- A footer with the company name and copyright information

### Embedded Images

The emails use base64-encoded images for the logo rather than external links. This is important because:

1. Many email clients block external images by default
2. Base64 embedding ensures images display even when recipients are offline
3. No dependency on external hosting for logo display
4. Improved privacy for recipients (no tracking via image loading)

The default logo is a simple blue placeholder with "Plugged.in" text. It's defined as a base64 constant in `lib/email.ts`.

## Debugging Tips

- If you're not seeing emails in Mailtrap:
  - Check the console for warnings about email sending failures
  - Verify your Mailtrap credentials are correct
  - Make sure the email sending function is actually being called
  - Confirm that all required environment variables are set correctly

- The application will still return the token in development mode for convenience, allowing you to test the verification and reset flows without having to check Mailtrap.

## Customizing Email Templates

The email templates can be customized by modifying the HTML in the following files:
- `lib/email.ts`: Contains the main email sending function and template generators

To change the logo:
1. Convert your logo to base64 format (many online tools can do this)
2. Replace the `DEFAULT_LOGO_BASE64` constant in `lib/email.ts`
3. Ensure the new logo is appropriately sized (recommended height: 50px)

## Moving to Production

When moving to production, you should:

1. Replace Mailtrap with a real email service like SendGrid, Mailgun, or Amazon SES
2. Update the `.env` variables on your production server
3. Remove the development-only token from API responses by setting `NODE_ENV=production`
4. Consider removing or securing the test endpoint (`/api/auth/test-email`) to prevent abuse
5. Replace the placeholder base64 logo with your actual company logo

### Logo Size Considerations

When embedding images as base64 in emails:
- Keep images small (ideally under 30KB) to avoid email size issues
- Optimize images before converting to base64
- Use appropriate image formats (PNG for logos with transparency, JPEG for photos)
- Test display across different email clients 