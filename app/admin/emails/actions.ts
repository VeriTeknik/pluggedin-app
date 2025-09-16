'use server';

import { db } from '@/db';
import { users, userEmailPreferencesTable, emailTrackingTable, adminAuditLogTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { getAdminEmails } from '@/lib/admin-notifications';
import { sendEmail } from '@/lib/email';
import { generateUnsubscribeUrl } from '@/lib/unsubscribe-tokens';
import { checkAdminRateLimit } from '@/lib/admin-rate-limiter';
import { translateToAllLanguages, supportedLanguages, type SupportedLanguage, type EmailTranslations } from '@/lib/email-translation-service';
import { sanitizeStrict, sanitizeEmailSubject } from '@/lib/sanitization';
import { isEmailConfigured, isTranslationAvailable, getAvailableAIProviders } from '@/lib/env-validation';
import { eq, and, gte, lte, sql, desc, asc, or, ne } from 'drizzle-orm';
import { marked } from 'marked';
import { z } from 'zod';
import { headers } from 'next/headers';

// Check if current user is admin with database check
async function checkAdminAuth() {
  const session = await getAuthSession();
  if (!session?.user?.email || !session?.user?.id) {
    throw new Error('Unauthorized');
  }

  // Check database for admin status
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!user?.is_admin) {
    // Fallback to environment variable check for backward compatibility
    const adminEmails = getAdminEmails();
    if (!adminEmails.includes(session.user.email)) {
      throw new Error('Unauthorized: Admin access required');
    }
  }

  return session;
}

// Log admin action for audit trail
async function logAdminAction(
  adminId: string,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: any
) {
  try {
    const headersList = await headers();
    const ipAddress = headersList.get('x-forwarded-for') ||
                     headersList.get('x-real-ip') ||
                     'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    await db.insert(adminAuditLogTable).values({
      adminId,
      action,
      targetType,
      targetId,
      details,
      ipAddress,
      userAgent,
    });
  } catch (error) {
    console.error('Failed to log admin action:', error);
    // Don't throw - audit logging failure shouldn't prevent the action
  }
}

// Get email statistics for dashboard
export async function getEmailStats() {
  try {
    const session = await checkAdminAuth();

    // Check general admin rate limit
    await checkAdminRateLimit(session.user.id, 'general');

    // Get total users
    const totalUsersResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(users);
    const totalUsers = Number(totalUsersResult[0]?.count || 0);

    // Get subscribed users (product updates enabled)
    const subscribedUsersResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userEmailPreferencesTable)
      .where(eq(userEmailPreferencesTable.productUpdates, true));
    const subscribedUsers = Number(subscribedUsersResult[0]?.count || 0);

    // Get emails sent today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sentTodayResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailTrackingTable)
      .where(
        and(
          gte(emailTrackingTable.sentAt, today),
          eq(emailTrackingTable.emailType, 'product_update')
        )
      );
    const sentToday = Number(sentTodayResult[0]?.count || 0);

    // Get emails sent this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const sentThisWeekResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailTrackingTable)
      .where(
        and(
          gte(emailTrackingTable.sentAt, weekAgo),
          eq(emailTrackingTable.emailType, 'product_update')
        )
      );
    const sentThisWeek = Number(sentThisWeekResult[0]?.count || 0);

    // Get emails sent this month
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const sentThisMonthResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailTrackingTable)
      .where(
        and(
          gte(emailTrackingTable.sentAt, monthAgo),
          eq(emailTrackingTable.emailType, 'product_update')
        )
      );
    const sentThisMonth = Number(sentThisMonthResult[0]?.count || 0);

    // Get last email sent
    const lastEmailResult = await db
      .select({ sentAt: emailTrackingTable.sentAt })
      .from(emailTrackingTable)
      .where(eq(emailTrackingTable.emailType, 'product_update'))
      .orderBy(desc(emailTrackingTable.sentAt))
      .limit(1);

    const lastEmailSent = lastEmailResult[0]?.sentAt?.toISOString() || null;

    return {
      success: true,
      data: {
        totalUsers,
        subscribedUsers,
        sentToday,
        sentThisWeek,
        sentThisMonth,
        lastEmailSent,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get email stats',
    };
  }
}

// Get eligible recipients for product updates
export async function getEmailRecipients(options: {
  segment?: 'all' | 'developer' | 'business' | 'enterprise';
  testMode?: boolean;
}) {
  try {
    const session = await checkAdminAuth();
    const { segment = 'all', testMode = false } = options;

    if (testMode) {
      // In test mode, only return the admin's email with their language preference
      const adminUser = await db.query.users.findFirst({
        where: eq(users.id, session.user.id),
      });

      return {
        success: true,
        data: {
          recipients: [{
            id: session.user.id,
            email: session.user.email!,
            name: session.user.name,
            language: adminUser?.language || 'en'
          }],
          count: 1,
        },
      };
    }

    // Get users who have product updates enabled
    const eligibleUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        language: users.language,
      })
      .from(users)
      .leftJoin(
        userEmailPreferencesTable,
        eq(users.id, userEmailPreferencesTable.userId)
      )
      .where(
        or(
          eq(userEmailPreferencesTable.productUpdates, true),
          sql`${userEmailPreferencesTable.productUpdates} IS NULL` // Default is true
        )
      );

    // Filter by segment if needed (you can add segment logic based on user metadata)
    let recipients = eligibleUsers;

    return {
      success: true,
      data: {
        recipients,
        count: recipients.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get recipients',
    };
  }
}

// Send bulk product update email
const sendBulkEmailSchema = z.object({
  subject: z.string().min(1).max(200),
  markdownContent: z.string().min(1),
  segment: z.enum(['all', 'developer', 'business', 'enterprise']).default('all'),
  testMode: z.boolean().default(true),
  translations: z.object({
    original: z.object({
      language: z.enum(['en', 'tr', 'zh', 'hi', 'ja', 'nl']),
      subject: z.string(),
      content: z.string(),
    }),
    translations: z.array(z.object({
      language: z.enum(['en', 'tr', 'zh', 'hi', 'ja', 'nl']),
      subject: z.string(),
      content: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
    })),
  }).optional(),
});

export async function sendBulkProductUpdate(input: z.infer<typeof sendBulkEmailSchema>) {
  try {
    const session = await checkAdminAuth();

    // Check rate limit for email campaigns
    await checkAdminRateLimit(session.user.id, 'email');

    // Validate environment configuration
    if (!isEmailConfigured()) {
      return {
        success: false,
        error: 'Email service is not properly configured. Please check EMAIL_SERVER settings.',
      };
    }

    // Validate input
    const validated = sendBulkEmailSchema.parse(input);

    // Check if translations are requested but not available
    if (!validated.testMode) {
      if (!isTranslationAvailable()) {
        console.warn('Translation requested but no AI API keys configured. Emails will be sent in original language only.');
      }
    }

    // Get recipients
    const recipientsResult = await getEmailRecipients({
      segment: validated.segment,
      testMode: validated.testMode,
    });

    if (!recipientsResult.success || !recipientsResult.data) {
      throw new Error('Failed to get recipients');
    }

    const { recipients } = recipientsResult.data;

    if (recipients.length === 0) {
      return {
        success: false,
        error: 'No eligible recipients found',
      };
    }


    // Send emails in batches
    const batchSize = 10;
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      const emailPromises = batch.map(async (recipient) => {
        try {
          // Determine which subject and content to use based on user language
          let emailSubject = validated.subject;
          let emailContent = validated.markdownContent;

          if (validated.translations && recipient.language) {
            const userLang = recipient.language as SupportedLanguage;
            const translation = validated.translations.translations.find(
              t => t.language === userLang && t.success
            );

            if (translation) {
              emailSubject = translation.subject;
              emailContent = translation.content;
            }
          }

          // Convert markdown to HTML for the selected language content
          const rawHtml = await marked(emailContent);
          // Use centralized strict sanitization (no images allowed)
          const cleanHtml = sanitizeStrict(rawHtml);

          // Generate localized HTML
          const html = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                a { color: #4F46E5; text-decoration: none; }
                .content { margin: 20px 0; }
                .footer { color: #666; font-size: 0.9em; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; }
                h1, h2, h3 { color: #111; margin-top: 20px; }
                pre, code { background: #f6f6f6; padding: 12px; border-radius: 4px; font-family: 'Monaco', 'Courier New', monospace; }
                blockquote { border-left: 4px solid #4F46E5; padding-left: 16px; margin: 16px 0; color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="content">
                  ${cleanHtml}
                </div>

                <div class="footer">
                  <p>Best regards,<br>The Plugged.in Team</p>
                  <p>
                    <a href="${await generateUnsubscribeUrl(recipient.id)}">Unsubscribe</a> |
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:12005'}/settings">Email Preferences</a>
                  </p>
                </div>
              </div>
            </body>
            </html>
          `;

          const result = await sendEmail({
            to: recipient.email,
            subject: sanitizeEmailSubject(emailSubject),
            html,
            from: process.env.EMAIL_FROM || 'noreply@plugged.in',
            fromName: 'Plugged.in',
            replyTo: process.env.EMAIL_REPLY_TO || 'cem@plugged.in',
          });

          if (result) {
            // Track the email with language information
            await db.insert(emailTrackingTable).values({
              userId: recipient.id,
              emailType: 'product_update',
              subject: emailSubject,
              segment: validated.segment,
              metadata: {
                testMode: validated.testMode,
                sentBy: session.user.email,
                language: recipient.language || 'en',
                isTranslated: emailSubject !== validated.subject,
              },
            });

            return true;
          }
          return false;
        } catch (error) {
          console.error(`Failed to send email to ${recipient.email}:`, error);
          return false;
        }
      });

      const results = await Promise.all(emailPromises);
      successCount += results.filter(r => r).length;
      failedCount += results.filter(r => !r).length;
    }

    // Log the admin action
    await logAdminAction(
      session.user.id,
      'send_bulk_email',
      'email_campaign',
      undefined,
      {
        subject: validated.subject,
        segment: validated.segment,
        testMode: validated.testMode,
        recipientCount: recipients.length,
        successCount,
        failedCount,
      }
    );

    return {
      success: true,
      data: {
        sent: successCount,
        failed: failedCount,
        total: recipients.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send emails',
    };
  }
}

// Get sent email history
export async function getEmailHistory(options: {
  limit?: number;
  offset?: number;
}) {
  try {
    await checkAdminAuth();

    const { limit = 50, offset = 0 } = options;

    const history = await db
      .select({
        id: emailTrackingTable.id,
        emailType: emailTrackingTable.emailType,
        subject: emailTrackingTable.subject,
        sentAt: emailTrackingTable.sentAt,
        segment: emailTrackingTable.segment,
        metadata: emailTrackingTable.metadata,
      })
      .from(emailTrackingTable)
      .where(eq(emailTrackingTable.emailType, 'product_update'))
      .orderBy(desc(emailTrackingTable.sentAt))
      .limit(limit)
      .offset(offset);

    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailTrackingTable)
      .where(eq(emailTrackingTable.emailType, 'product_update'));

    const total = Number(totalResult[0]?.count || 0);

    return {
      success: true,
      data: {
        history,
        total,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get email history',
    };
  }
}

// Email template management
const emailTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  subject: z.string().min(1).max(200),
  content: z.string().min(1),
  category: z.enum(['product_update', 'feature_announcement', 'newsletter', 'other']).default('other'),
});

// For now, we'll store templates in memory (you can add a database table later)
const templates = new Map<string, z.infer<typeof emailTemplateSchema>>();

export async function saveEmailTemplate(input: z.infer<typeof emailTemplateSchema>) {
  try {
    await checkAdminAuth();

    const validated = emailTemplateSchema.parse(input);
    const templateId = validated.name.toLowerCase().replace(/\s+/g, '-');

    templates.set(templateId, validated);

    return {
      success: true,
      data: {
        id: templateId,
        ...validated,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save template',
    };
  }
}

export async function getEmailTemplates() {
  try {
    await checkAdminAuth();

    const templateList = Array.from(templates.entries()).map(([id, template]) => ({
      id,
      ...template,
    }));

    // Add some default templates if none exist
    if (templateList.length === 0) {
      const defaultTemplates = [
        {
          id: 'product-update',
          name: 'Product Update',
          subject: '🚀 New Features in Plugged.in',
          content: `Hi {{firstName}},

We've been busy building new features to make your Plugged.in experience even better!

## What's New

### 🎯 Feature 1
Description of the first new feature.

### 🔧 Feature 2
Description of the second new feature.

### 📊 Feature 3
Description of the third new feature.

## Coming Soon
- Upcoming feature 1
- Upcoming feature 2

[Check out the new features →](https://plugged.in)

Happy building!`,
          category: 'product_update' as const,
        },
        {
          id: 'feature-announcement',
          name: 'Feature Announcement',
          subject: 'Introducing: [Feature Name]',
          content: `Hi {{firstName}},

We're excited to announce a new feature that will revolutionize how you work with MCP servers!

## Introducing [Feature Name]

[Description of the feature and its benefits]

### How It Works
1. Step one
2. Step two
3. Step three

### Get Started
[Link to documentation or tutorial]

We can't wait to see what you build with this!`,
          category: 'feature_announcement' as const,
        },
        {
          id: 'day-3-followup',
          name: 'Day 3 Follow-up',
          subject: 'Quick tip: Your docs are now AI-searchable 📚',
          content: `Hi {{firstName}},

Just a quick tip that might save you hours...

Did you know that every document you upload to Plugged.in becomes instantly searchable by your AI?

Here's the magic:
1. **Upload any document** → [plugged.in/library](https://plugged.in/library)
2. **Your AI can now search it** using "Ask Knowledge Base" in Claude Desktop
3. **No more copy-pasting** - your AI remembers everything

### 🎯 Pro Tip
Upload your project docs, API references, or meeting notes. Your AI will reference them automatically when you ask questions.

### Popular Use Cases Our Users Love:
- 📝 **Project documentation** - "What was our decision about the auth flow?"
- 📊 **Data sheets** - "What were last quarter's metrics?"
- 🔧 **API docs** - "How do I authenticate with our backend?"

[Upload your first document →](https://plugged.in/library)

Takes 30 seconds, saves hours of searching.

P.S. Your documents are encrypted and only accessible by you. Privacy first, always.`,
          category: 'newsletter' as const,
        },
        {
          id: 'day-7-followup',
          name: 'Day 7 Follow-up',
          subject: 'Your MCP servers, working together 🔗',
          content: `Hi {{firstName}},

Hope you've had a chance to explore Plugged.in!

Here's something cool: **your MCP servers can work together**.

### Example Workflow
Imagine you have:
- 📚 **Context7** for documentation
- 🗄️ **Database** for your data
- 📧 **Email** for notifications

Your AI can now:
1. Look up documentation (Context7)
2. Query your database based on those docs
3. Send you a summary via email

All in one conversation. No switching tools.

### 🎯 Quick Setup Ideas:
**For Developers:**
- Context7 + GitHub + Slack = Automated PR reviews with notifications

**For Data Analysts:**
- Database + Sequential Thinking + Notifications = Complex analysis with alerts

**For Everyone:**
- Document Library + Any MCP = Your personal knowledge assistant

### Need Help Setting This Up?
- 📖 [Setup Guide](https://plugged.in/setup-guide)
- 💬 [Join our Discord](https://discord.gg/pluggedin)
- 📅 [Book a quick call](https://calendly.com/cem-pluggedin/onboarding)

Or just reply to this email - I read everything personally!

Keep building amazing things,
Cem 🐾`,
          category: 'newsletter' as const,
        },
        {
          id: 'day-14-followup',
          name: 'Day 14 Follow-up',
          subject: "You're sitting on a goldmine of data 💎",
          content: `Hi {{firstName}},

Two weeks in - how's your Plugged.in journey going?

Here's what successful users do differently: **they upload their existing knowledge**.

### Your Data Goldmine:
- 📄 **Old project docs** → Instant project memory
- 📊 **Spreadsheets** → AI-powered analysis
- 📝 **Meeting notes** → Never forget a decision
- 📚 **Research papers** → Your personal research assistant

### The Magic Moment ✨
Users tell us their "aha!" moment comes when they ask their AI something like:
- "What did we decide about pricing in the Q2 meeting?"
- "How did we solve the authentication bug last time?"
- "What were the key findings from that research paper?"

And their AI just... knows.

### 📈 By The Numbers:
- Average user uploads **12 documents** in first month
- Saves **3+ hours per week** on information retrieval
- **87% faster** at finding past decisions

### Ready to unlock your goldmine?
1. [Upload your documents](https://plugged.in/library)
2. Ask your AI anything about them
3. Watch the magic happen

Still have questions? Just reply - I personally read every email.

Happy building!
Cem 🐾

P.S. Did you know you can share MCP server collections with your team? [Check it out →](https://plugged.in/social/collections)`,
          category: 'newsletter' as const,
        },
        {
          id: 'day-30-followup',
          name: 'Day 30 Check-in',
          subject: "One month with Plugged.in - what's next? 🎯",
          content: `Hi {{firstName}},

It's been a month since you joined Plugged.in! 🎉

### Quick Check-in:
How's everything going? I'd love to hear:
- What's working well?
- What could be better?
- What features would you like to see?

Just reply to this email - I read every response personally.

### 📊 Your Plugged.in Journey So Far:
- Documents uploaded: [Check your library](https://plugged.in/library)
- MCP servers connected: [View servers](https://plugged.in/mcp-servers)
- Time saved: Probably hours by now!

### 🚀 Advanced Features You Might Have Missed:

**1. Custom MCP Servers**
Did you know you can create your own MCP servers? [Learn how →](https://plugged.in/docs/custom-servers)

**2. Team Collaboration**
Share server collections with your team for consistent setups. [Explore →](https://plugged.in/social/collections)

**3. API Access**
Integrate Plugged.in with your existing tools. [API Docs →](https://plugged.in/api-docs)

### 🎁 Special Offer
As a thank you for being an early adopter, here's 20% off any paid plan:
Code: **MONTH1-20**

### Need Help?
- 📅 [Book a 1-on-1 call](https://calendly.com/cem-pluggedin/power-user)
- 💬 [Join our Discord](https://discord.gg/pluggedin)
- 📧 Just reply to this email

Looking forward to hearing from you!

Cem 🐾
Founder @ Plugged.in

P.S. We ship new features every week. [See what's new →](https://plugged.in/release-notes)`,
          category: 'newsletter' as const,
        },
        {
          id: 'inactive-user-reengagement',
          name: 'Re-engagement Email',
          subject: "We miss you at Plugged.in 👋",
          content: `Hi {{firstName}},

It's been a while since we've seen you at Plugged.in!

Just wanted to check in and let you know about some exciting updates you might have missed:

### 🆕 What's New:
- **AI Document Search**: Your uploaded docs are now AI-searchable
- **Team Sharing**: Share MCP server collections with colleagues
- **10+ New MCP Servers**: Including databases, APIs, and more

### 💡 Quick Win:
Takes 2 minutes to see the magic:
1. [Upload a document](https://plugged.in/library)
2. Ask Claude Desktop about it
3. Be amazed 🤯

### Need Help Getting Started?
Sometimes we all need a nudge. Here are some resources:
- 🎥 [2-minute video tutorial](https://plugged.in/quick-start)
- 📖 [Step-by-step guide](https://plugged.in/setup-guide)
- 💬 [Chat with support](https://plugged.in/support)

### 🎁 Welcome Back Offer
Use code **COMEBACK** for 30% off your first month of any paid plan.

If Plugged.in isn't right for you, no worries at all! You can [unsubscribe here](https://plugged.in/unsubscribe).

But if you're ready to give it another try, we're here to help!

Cem 🐾

P.S. Seriously, just reply if you need help. I read every email.`,
          category: 'newsletter' as const,
        },
      ];

      defaultTemplates.forEach(template => {
        templates.set(template.id, template);
      });

      return {
        success: true,
        data: defaultTemplates,
      };
    }

    return {
      success: true,
      data: templateList,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get templates',
    };
  }
}

// Translation action for email content
const translateEmailSchema = z.object({
  subject: z.string().min(1),
  content: z.string().min(1),
  sourceLanguage: z.enum(['en', 'tr', 'zh', 'hi', 'ja', 'nl']).default('en'),
});

export async function translateEmailContent(input: z.infer<typeof translateEmailSchema>): Promise<{
  success: boolean;
  data?: EmailTranslations;
  error?: string;
}> {
  try {
    const session = await checkAdminAuth();

    // Check if translation is available
    if (!isTranslationAvailable()) {
      return {
        success: false,
        error: 'Translation service is not configured. Please add at least one AI API key (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY).',
      };
    }

    // Rate limit translation requests
    await checkAdminRateLimit(session.user.id, 'general');

    const validated = translateEmailSchema.parse(input);

    // Log the translation action
    await logAdminAction(
      session.user.id,
      'email_translate',
      'email',
      undefined,
      { sourceLanguage: validated.sourceLanguage }
    );

    // Perform translations
    const translations = await translateToAllLanguages(
      validated.subject,
      validated.content,
      validated.sourceLanguage
    );

    return {
      success: true,
      data: translations,
    };
  } catch (error) {
    console.error('Translation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to translate email',
    };
  }
}

// Get email service configuration status
export async function getEmailConfigStatus(): Promise<{
  success: boolean;
  data?: {
    emailConfigured: boolean;
    translationAvailable: boolean;
    aiProviders: string[];
    warnings: string[];
  };
  error?: string;
}> {
  try {
    await checkAdminAuth();

    const warnings: string[] = [];

    // Check email configuration
    const emailConfigured = isEmailConfigured();
    if (!emailConfigured) {
      warnings.push('Email service is not configured. Emails cannot be sent.');
    }

    // Check translation availability
    const translationAvailable = isTranslationAvailable();
    const aiProviders = getAvailableAIProviders();

    if (!translationAvailable) {
      warnings.push('No AI API keys configured. Email translation is unavailable.');
    }

    // Check unsubscribe token secret
    if (!process.env.UNSUBSCRIBE_TOKEN_SECRET) {
      warnings.push('UNSUBSCRIBE_TOKEN_SECRET not set. Using NEXTAUTH_SECRET as fallback.');
    }

    return {
      success: true,
      data: {
        emailConfigured,
        translationAvailable,
        aiProviders,
        warnings,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get configuration status',
    };
  }
}
