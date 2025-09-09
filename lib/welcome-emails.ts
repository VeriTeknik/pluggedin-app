import { sendEmail } from '@/lib/email';
import { db } from '@/db';
import { emailTrackingTable, scheduledEmailsTable } from '@/db/schema';

export type UserSegment = 'developer' | 'business' | 'enterprise';

export interface WelcomeEmailOptions {
  name: string;
  email: string;
  segment?: UserSegment;
  signupSource?: string;
  trialUser?: boolean;
}

/**
 * Determine user segment based on email domain and other factors
 */
export function determineUserSegment(email: string, signupSource?: string): UserSegment {
  const domain = email.split('@')[1]?.toLowerCase();
  
  // Enterprise domains (Fortune 500, large companies)
  const enterpriseDomains = ['ibm.com', 'microsoft.com', 'google.com', 'amazon.com', 'apple.com'];
  if (domain && enterpriseDomains.some(d => domain.includes(d))) {
    return 'enterprise';
  }
  
  // Developer indicators
  const developerDomains = ['github.com', 'gitlab.com', 'dev.', '.dev', '.io'];
  const developerSources = ['api', 'github', 'technical-docs'];
  if (
    (domain && developerDomains.some(d => domain.includes(d))) ||
    (signupSource && developerSources.includes(signupSource))
  ) {
    return 'developer';
  }
  
  // Default to business for general users
  return 'business';
}

/**
 * Get the appropriate subject line for the welcome email
 */
function getWelcomeSubject(segment: UserSegment, abVariant: 'A' | 'B' = 'A'): string {
  const subjects = {
    developer: {
      A: 'Welcome to Plugged.in — Your MCP servers await connection',
      B: "Let's integrate your first AI in 2 minutes",
    },
    business: {
      A: 'Welcome to Plugged.in — Your AI assistant is ready',
      B: "You're in! Let's make AI work for you",
    },
    enterprise: {
      A: "Welcome to Plugged.in Enterprise — Your team's AI command center",
      B: "{{company_name}}'s AI infrastructure is ready",
    },
  };
  
  return subjects[segment][abVariant];
}

/**
 * Generate welcome email HTML based on user segment
 */
function generateWelcomeHtml(options: WelcomeEmailOptions & { segment: UserSegment }): string {
  const { name, email, segment, trialUser } = options;
  const firstName = name.split(' ')[0];
  const appUrl = process.env.NEXTAUTH_URL || 'https://plugged.in';
  const appName = process.env.EMAIL_FROM_NAME || 'Plugged.in';
  
  // Developer-focused template
  if (segment === 'developer') {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to ${appName}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; color: #1f2937;">
        <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); padding: 32px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                      Welcome to ${appName}
                    </h1>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 32px;">
                    <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.5;">
                      Hi ${firstName},
                    </p>
                    
                    <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.5;">
                      Welcome to ${appName}! You're about to simplify how you manage AI interactions across all your tools.
                    </p>
                    
                    <div style="background-color: #f0f9ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 24px 0;">
                      <p style="margin: 0; font-weight: 600; color: #1e40af;">
                        Your first mission (should you choose to accept it):
                      </p>
                    </div>
                    
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="${appUrl}/mcp-servers/quick-connect" style="display: inline-block; padding: 14px 32px; background-color: #3b82f6; color: #ffffff; text-decoration: none; font-weight: 600; border-radius: 6px; font-size: 16px;">
                        🚀 Connect Your First MCP Server
                      </a>
                      <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">
                        ^ This takes literally 2 minutes. We timed it.
                      </p>
                    </div>
                    
                    <div style="margin: 32px 0;">
                      <h3 style="margin: 0 0 16px; color: #1f2937; font-size: 18px; font-weight: 600;">
                        While you're here, you can also:
                      </h3>
                      <ul style="margin: 0; padding-left: 20px; color: #4b5563; line-height: 1.8;">
                        <li>Upload docs to your RAG library for contextual AI responses</li>
                        <li>Set up your sequential thinking chains</li>
                        <li>Configure your PostgreSQL connections</li>
                      </ul>
                    </div>
                    
                    <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 32px 0;">
                      <h3 style="margin: 0 0 12px; color: #1f2937; font-size: 16px; font-weight: 600;">
                        Quick resources for developers:
                      </h3>
                      <table style="width: 100%;">
                        <tr>
                          <td style="padding: 8px 0;">
                            <a href="${appUrl}/docs/api" style="color: #3b82f6; text-decoration: none; font-weight: 500;">
                              📖 API Documentation →
                            </a>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <a href="https://github.com/pluggedin/examples" style="color: #3b82f6; text-decoration: none; font-weight: 500;">
                              💻 GitHub Examples →
                            </a>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0;">
                            <a href="${appUrl}/docs/quickstart" style="color: #3b82f6; text-decoration: none; font-weight: 500;">
                              🎥 2-min Setup Video →
                            </a>
                          </td>
                        </tr>
                      </table>
                    </div>
                    
                    <div style="margin: 32px 0; padding: 20px; background-color: #fef3c7; border-radius: 6px;">
                      <p style="margin: 0; color: #92400e; font-size: 14px;">
                        <strong>Pro tip:</strong> Join our Discord (discord.gg/pluggedin) where 1,000+ devs share their MCP configurations and workflows.
                      </p>
                    </div>
                    
                    <p style="margin: 24px 0 0; color: #4b5563; font-size: 14px; line-height: 1.5;">
                      Got stuck? Hit reply. I read every email.
                    </p>
                    
                    <p style="margin: 16px 0 0; color: #1f2937; font-size: 14px;">
                      Happy building,<br>
                      <strong>Sarah Chen</strong><br>
                      Developer Success @ ${appName}
                    </p>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">
                      © ${new Date().getFullYear()} ${appName}. All rights reserved.
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                      <a href="${appUrl}/unsubscribe" style="color: #9ca3af;">Unsubscribe</a> | 
                      <a href="${appUrl}/preferences" style="color: #9ca3af;">Email Preferences</a>
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
  
  // Business user template
  if (segment === 'business') {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to ${appName}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; color: #1f2937;">
        <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #10b981 0%, #047857 100%); padding: 32px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                      Welcome to ${appName}! 🎉
                    </h1>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 32px;">
                    <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.5;">
                      Hi ${firstName},
                    </p>
                    
                    <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.5;">
                      You just joined the easiest way to make AI work across all your business tools — no coding required.
                    </p>
                    
                    <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; margin: 24px 0;">
                      <p style="margin: 0; font-weight: 600; color: #047857;">
                        Let's get your first win in 30 seconds:
                      </p>
                    </div>
                    
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="${appUrl}/library/upload" style="display: inline-block; padding: 14px 32px; background-color: #10b981; color: #ffffff; text-decoration: none; font-weight: 600; border-radius: 6px; font-size: 16px;">
                        📚 Upload Your First Document
                      </a>
                      <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">
                        This instantly gives your AI context about your business
                      </p>
                    </div>
                    
                    <div style="margin: 32px 0;">
                      <h3 style="margin: 0 0 16px; color: #1f2937; font-size: 18px; font-weight: 600;">
                        Here's what successful teams do in their first week:
                      </h3>
                      <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px;">
                        <div style="margin-bottom: 16px;">
                          <strong style="color: #10b981;">✓ Day 1:</strong> Upload key documents (product info, FAQs, processes)
                        </div>
                        <div style="margin-bottom: 16px;">
                          <strong style="color: #10b981;">✓ Day 2:</strong> Connect their first AI assistant
                        </div>
                        <div>
                          <strong style="color: #10b981;">✓ Day 3:</strong> Create their first automated workflow
                        </div>
                      </div>
                    </div>
                    
                    <div style="background-color: #fef3c7; border-radius: 6px; padding: 20px; margin: 32px 0; text-align: center;">
                      <p style="margin: 0 0 16px; color: #92400e; font-size: 16px; font-weight: 600;">
                        Need a guided tour?
                      </p>
                      <a href="${appUrl}/onboarding/schedule" style="display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: #ffffff; text-decoration: none; font-weight: 600; border-radius: 6px; font-size: 14px;">
                        Book a 15-min Onboarding Call
                      </a>
                    </div>
                    
                    <div style="margin: 32px 0;">
                      <p style="margin: 0 0 12px; color: #6b7280; font-size: 14px;">
                        Or watch how Jennifer from TechCorp saves 6 hours weekly:
                      </p>
                      <a href="${appUrl}/success-stories/techcorp" style="color: #3b82f6; text-decoration: none; font-weight: 500;">
                        🎥 Watch 3-min Success Story →
                      </a>
                    </div>
                    
                    <p style="margin: 24px 0 0; color: #4b5563; font-size: 14px; line-height: 1.5;">
                      Questions? Just reply to this email — a real human (me!) will help.
                    </p>
                    
                    <p style="margin: 16px 0 0; color: #1f2937; font-size: 14px;">
                      Excited to see your productivity soar,<br>
                      <strong>Michael Torres</strong><br>
                      Customer Success @ ${appName}
                    </p>
                    
                    <div style="margin: 24px 0 0; padding: 16px; background-color: #f0f9ff; border-radius: 6px;">
                      <p style="margin: 0; color: #1e40af; font-size: 13px;">
                        <strong>P.S.</strong> You're joining 5,000+ businesses already transforming their AI workflows. Welcome to the community!
                      </p>
                    </div>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">
                      © ${new Date().getFullYear()} ${appName}. All rights reserved.
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                      <a href="${appUrl}/unsubscribe" style="color: #9ca3af;">Unsubscribe</a> | 
                      <a href="${appUrl}/preferences" style="color: #9ca3af;">Email Preferences</a>
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
  
  // Enterprise template
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to ${appName} Enterprise</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; color: #1f2937;">
      <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%); padding: 32px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                    Welcome to ${appName} Enterprise
                  </h1>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding: 32px;">
                  <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.5;">
                    Dear ${firstName},
                  </p>
                  
                  <p style="margin: 0 0 24px; font-size: 16px; line-height: 1.5;">
                    Welcome to ${appName} Enterprise. Your organization now has access to enterprise-grade AI orchestration.
                  </p>
                  
                  <div style="background-color: #eef2ff; border-left: 4px solid #6366f1; padding: 16px; margin: 24px 0;">
                    <p style="margin: 0; font-weight: 600; color: #4338ca;">
                      Your Priority Setup Checklist:
                    </p>
                  </div>
                  
                  <div style="margin: 24px 0;">
                    <a href="${appUrl}/admin/permissions" style="display: inline-block; width: 100%; padding: 14px; background-color: #6366f1; color: #ffffff; text-decoration: none; font-weight: 600; border-radius: 6px; font-size: 16px; text-align: center; margin-bottom: 12px; box-sizing: border-box;">
                      🔐 Configure Team Permissions
                    </a>
                    <a href="${appUrl}/admin/dashboard" style="display: inline-block; width: 100%; padding: 14px; background-color: #ffffff; color: #6366f1; text-decoration: none; font-weight: 600; border-radius: 6px; font-size: 16px; text-align: center; border: 2px solid #6366f1; box-sizing: border-box;">
                      📊 View Your Admin Dashboard
                    </a>
                  </div>
                  
                  <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 32px 0;">
                    <h3 style="margin: 0 0 16px; color: #1f2937; font-size: 16px; font-weight: 600;">
                      As an enterprise customer, you have access to:
                    </h3>
                    <ul style="margin: 0; padding-left: 20px; color: #4b5563; line-height: 1.8;">
                      <li>Dedicated onboarding specialist</li>
                      <li>Priority support channel</li>
                      <li>Custom integration assistance</li>
                      <li>Quarterly business reviews</li>
                    </ul>
                  </div>
                  
                  <div style="background-color: #fef3c7; border-radius: 6px; padding: 20px; margin: 32px 0;">
                    <p style="margin: 0; color: #92400e; font-size: 14px;">
                      <strong>Important:</strong> Your dedicated success manager, Amanda Williams, will reach out within 24 hours to schedule your team's onboarding session.
                    </p>
                  </div>
                  
                  <div style="margin: 32px 0;">
                    <h3 style="margin: 0 0 16px; color: #1f2937; font-size: 16px; font-weight: 600;">
                      In the meantime:
                    </h3>
                    <table style="width: 100%;">
                      <tr>
                        <td style="padding: 8px 0;">
                          <a href="${appUrl}/docs/enterprise-guide" style="color: #6366f1; text-decoration: none; font-weight: 500;">
                            📋 Enterprise Setup Guide →
                          </a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <a href="${appUrl}/security" style="color: #6366f1; text-decoration: none; font-weight: 500;">
                            🔒 Security Whitepaper →
                          </a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong>📞 Priority Support:</strong> +1-555-PLUGGED
                        </td>
                      </tr>
                    </table>
                  </div>
                  
                  <p style="margin: 24px 0 0; color: #4b5563; font-size: 14px; line-height: 1.5;">
                    We're committed to your team's success.
                  </p>
                  
                  <p style="margin: 16px 0 0; color: #1f2937; font-size: 14px;">
                    Best regards,<br>
                    <strong>David Kim</strong><br>
                    VP of Enterprise Success<br>
                    ${appName}<br><br>
                    Direct line: +1-555-0123<br>
                    Email: david.kim@plugged.in
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">
                    © ${new Date().getFullYear()} ${appName} Enterprise. All rights reserved.
                  </p>
                  <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                    <a href="${appUrl}/unsubscribe" style="color: #9ca3af;">Unsubscribe</a> | 
                    <a href="${appUrl}/preferences" style="color: #9ca3af;">Email Preferences</a>
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
 * Send welcome email to new user
 */
export async function sendWelcomeEmail(options: WelcomeEmailOptions & { userId?: string }): Promise<boolean> {
  const { email, signupSource, userId } = options;
  
  // Check if welcome emails are enabled
  if (process.env.ENABLE_WELCOME_EMAILS === 'false') {
    console.log('Welcome emails are disabled');
    return false;
  }
  
  // Determine user segment
  const segment = options.segment || determineUserSegment(email, signupSource);
  
  // Get subject line (could implement A/B testing here)
  const abVariant = Math.random() > 0.5 ? 'A' : 'B'; // Simple A/B test
  const subject = getWelcomeSubject(segment, abVariant as 'A' | 'B');
  
  // Generate HTML content
  const html = generateWelcomeHtml({ ...options, segment });
  
  try {
    const result = await sendEmail({
      to: email,
      subject,
      html,
    });
    
    if (result) {
      console.log(`Welcome email sent successfully to ${email} (segment: ${segment})`);
      
      // Track email sending in database if userId is provided
      if (userId) {
        try {
          await db.insert(emailTrackingTable).values({
            userId,
            emailType: 'welcome',
            segment,
            variant: abVariant,
            subject,
            metadata: {
              signupSource,
            },
          });
          
          // Schedule follow-up emails
          await scheduleFollowUpEmails(userId, email, segment);
        } catch (trackingError) {
          console.error('Failed to track email or schedule follow-ups:', trackingError);
          // Don't fail the whole operation if tracking fails
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    return false;
  }
}

/**
 * Schedule follow-up emails
 */
export async function scheduleFollowUpEmails(userId: string, email: string, segment: UserSegment) {
  try {
    // Schedule Day 2 follow-up
    const day2Date = new Date();
    day2Date.setDate(day2Date.getDate() + 2);
    
    await db.insert(scheduledEmailsTable).values({
      userId,
      emailType: 'follow_up_2',
      scheduledFor: day2Date,
      metadata: {
        segment,
        email,
      },
    });
    
    // Schedule Day 5 follow-up
    const day5Date = new Date();
    day5Date.setDate(day5Date.getDate() + 5);
    
    await db.insert(scheduledEmailsTable).values({
      userId,
      emailType: 'follow_up_5',
      scheduledFor: day5Date,
      metadata: {
        segment,
        email,
      },
    });
    
    console.log(`Follow-up emails scheduled for user ${userId}:`, {
      day2: day2Date,
      day5: day5Date,
      segment,
    });
  } catch (error) {
    console.error('Failed to schedule follow-up emails:', error);
  }
}