'use server';

import { and, desc, eq, gte,or, sql } from 'drizzle-orm';
import { marked } from 'marked';
import { headers } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import { adminAuditLogTable, emailTemplatesTable,emailTrackingTable, userEmailPreferencesTable, users } from '@/db/schema';
import { getAdminEmails } from '@/lib/admin-notifications';
import { checkAdminRateLimit } from '@/lib/admin-rate-limiter';
import { getAuthSession } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { type EmailTranslations,type SupportedLanguage, translateToAllLanguages } from '@/lib/email-translation-service';
import { getAvailableAIProviders,isEmailConfigured, isTranslationAvailable } from '@/lib/env-validation';
import { sanitizeEmailSubject,sanitizeStrict } from '@/lib/sanitization';
import { generateUnsubscribeUrl } from '@/lib/unsubscribe-tokens';

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
    const recipients = eligibleUsers;

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

// Create a new email template
export async function createEmailTemplate(input: z.infer<typeof emailTemplateSchema>) {
  try {
    const session = await checkAdminAuth();
    const validated = emailTemplateSchema.parse(input);

    // Check if template name already exists
    const existing = await db.query.emailTemplatesTable.findFirst({
      where: eq(emailTemplatesTable.name, validated.name),
    });

    if (existing) {
      return {
        success: false,
        error: 'Template with this name already exists',
      };
    }

    // Insert new template
    const [newTemplate] = await db
      .insert(emailTemplatesTable)
      .values({
        name: validated.name,
        subject: validated.subject,
        content: validated.content,
        category: validated.category,
        variables: [], // Will be extracted from content later
        createdBy: session.user.id,
        updatedBy: session.user.id,
      })
      .returning();

    // Log admin action
    await logAdminAction(session.user.id, 'CREATE_EMAIL_TEMPLATE', 'email_template', newTemplate.id, {
      templateName: validated.name,
      category: validated.category,
    });

    return {
      success: true,
      data: newTemplate,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create template',
    };
  }
}

// Update existing email template
export async function updateEmailTemplate(id: string, input: Partial<z.infer<typeof emailTemplateSchema>>) {
  try {
    const session = await checkAdminAuth();

    // Check if template exists using simpler query
    const existingTemplates = await db
      .select()
      .from(emailTemplatesTable)
      .where(eq(emailTemplatesTable.id, id))
      .limit(1);

    if (!existingTemplates || existingTemplates.length === 0) {
      return {
        success: false,
        error: 'Template not found',
      };
    }

    const existing = existingTemplates[0];

    // Skip versioning for now to simplify - just update directly
    try {
      // Update the template
      const [updatedTemplate] = await db
        .update(emailTemplatesTable)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.subject !== undefined && { subject: input.subject }),
          ...(input.content !== undefined && { content: input.content }),
          ...(input.category !== undefined && { category: input.category }),
          updatedBy: session.user.id,
          updatedAt: new Date(),
        })
        .where(eq(emailTemplatesTable.id, id))
        .returning();

      // Log admin action
      await logAdminAction(session.user.id, 'UPDATE_EMAIL_TEMPLATE', 'email_template', id, {
        changes: Object.keys(input),
      });

      return {
        success: true,
        data: updatedTemplate,
      };
    } catch (updateError: any) {
      console.error('Update error details:', updateError);
      return {
        success: false,
        error: `Update failed: ${updateError.message || 'Unknown error'}`,
      };
    }
  } catch (error: any) {
    console.error('updateEmailTemplate error:', error);
    return {
      success: false,
      error: error.message || 'Failed to update template',
    };
  }
}

// Delete email template (soft delete)
export async function deleteEmailTemplate(id: string) {
  try {
    const session = await checkAdminAuth();

    // Check if template exists
    const existing = await db.query.emailTemplatesTable.findFirst({
      where: eq(emailTemplatesTable.id, id),
    });

    if (!existing) {
      return {
        success: false,
        error: 'Template not found',
      };
    }

    // Soft delete by setting isActive to false
    await db
      .update(emailTemplatesTable)
      .set({
        isActive: false,
        updatedBy: session.user.id,
        updatedAt: new Date(),
      })
      .where(eq(emailTemplatesTable.id, id));

    // Log admin action
    await logAdminAction(session.user.id, 'DELETE_EMAIL_TEMPLATE', 'email_template', id, {
      templateName: existing.name,
    });

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete template',
    };
  }
}

// Get single email template
export async function getEmailTemplate(id: string) {
  try {
    await checkAdminAuth();

    // Direct query without joins to avoid any potential issues
    const templates = await db
      .select()
      .from(emailTemplatesTable)
      .where(
        and(
          eq(emailTemplatesTable.id, id),
          eq(emailTemplatesTable.isActive, true)
        )
      )
      .limit(1);

    if (!templates || templates.length === 0) {
      return {
        success: false,
        error: 'Template not found',
      };
    }

    const template = templates[0];

    // Get user email separately if needed
    let createdByEmail = null;
    if (template.createdBy) {
      const creator = await db.query.users.findFirst({
        where: eq(users.id, template.createdBy),
        columns: { email: true },
      });
      createdByEmail = creator?.email;
    }

    // Format the response to match expected structure
    const formattedTemplate = {
      ...template,
      createdBy: createdByEmail ? { email: createdByEmail } : undefined,
      updatedBy: createdByEmail ? { email: createdByEmail } : undefined,
    };

    return {
      success: true,
      data: formattedTemplate,
    };
  } catch (error) {
    console.error('getEmailTemplate error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch template',
    };
  }
}

// Duplicate email template
export async function duplicateEmailTemplate(id: string, newName: string) {
  try {
    const session = await checkAdminAuth();

    // Get original template
    const original = await db.query.emailTemplatesTable.findFirst({
      where: eq(emailTemplatesTable.id, id),
    });

    if (!original) {
      return {
        success: false,
        error: 'Template not found',
      };
    }

    // Check if new name already exists
    const existing = await db.query.emailTemplatesTable.findFirst({
      where: eq(emailTemplatesTable.name, newName),
    });

    if (existing) {
      return {
        success: false,
        error: 'Template with this name already exists',
      };
    }

    // Create duplicate
    const [newTemplate] = await db
      .insert(emailTemplatesTable)
      .values({
        name: newName,
        subject: original.subject,
        content: original.content,
        category: original.category,
        variables: original.variables,
        createdBy: session.user.id,
        updatedBy: session.user.id,
      })
      .returning();

    // Log admin action
    await logAdminAction(session.user.id, 'DUPLICATE_EMAIL_TEMPLATE', 'email_template', newTemplate.id, {
      originalId: id,
      originalName: original.name,
      newName: newName,
    });

    return {
      success: true,
      data: newTemplate,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to duplicate template',
    };
  }
}

// Backwards compatibility - redirect to createEmailTemplate
export async function saveEmailTemplate(input: z.infer<typeof emailTemplateSchema>) {
  return createEmailTemplate(input);
}

export async function getEmailTemplates() {
  try {
    await checkAdminAuth();

    // Use a simpler query without relations to avoid loading issues
    const templates = await db
      .select({
        id: emailTemplatesTable.id,
        name: emailTemplatesTable.name,
        subject: emailTemplatesTable.subject,
        content: emailTemplatesTable.content,
        category: emailTemplatesTable.category,
        variables: emailTemplatesTable.variables,
        isActive: emailTemplatesTable.isActive,
        version: emailTemplatesTable.version,
        parentId: emailTemplatesTable.parentId,
        metadata: emailTemplatesTable.metadata,
        createdAt: emailTemplatesTable.createdAt,
        updatedAt: emailTemplatesTable.updatedAt,
        createdBy: emailTemplatesTable.createdBy,
        updatedBy: emailTemplatesTable.updatedBy,
      })
      .from(emailTemplatesTable)
      .where(eq(emailTemplatesTable.isActive, true))
      .orderBy(desc(emailTemplatesTable.createdAt));

    return {
      success: true,
      data: templates,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch templates',
    };
  }
}

// Get template version history
export async function getTemplateVersions(templateId: string) {
  try {
    await checkAdminAuth();

    // Simple query without joins
    const versions = await db
      .select()
      .from(emailTemplatesTable)
      .where(
        or(
          eq(emailTemplatesTable.id, templateId),
          eq(emailTemplatesTable.parentId, templateId)
        )
      )
      .orderBy(desc(emailTemplatesTable.version));

    return {
      success: true,
      data: versions,
    };
  } catch (error) {
    console.error('getTemplateVersions error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch template versions',
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
