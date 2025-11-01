import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getEmailStats,
  getEmailRecipients,
  sendBulkProductUpdate,
  getEmailHistory,
  saveEmailTemplate,
  getEmailTemplates,
  translateEmailContent,
} from '@/app/admin/emails/actions';
import { db } from '@/db';
import * as auth from '@/lib/auth';
import * as adminNotifications from '@/lib/admin-notifications';
import * as email from '@/lib/email';
import * as unsubscribeTokens from '@/lib/unsubscribe-tokens';
import * as adminRateLimiter from '@/lib/admin-rate-limiter';
import * as emailTranslationService from '@/lib/email-translation-service';

// Mock all dependencies
vi.mock('@/db');
vi.mock('@/lib/auth');
vi.mock('@/lib/admin-notifications');
vi.mock('@/lib/email');
vi.mock('@/lib/unsubscribe-tokens');
vi.mock('@/lib/admin-rate-limiter');
vi.mock('@/lib/email-translation-service');
vi.mock('next/headers', () => ({
  headers: vi.fn(() => ({
    get: vi.fn((key) => {
      if (key === 'x-forwarded-for') return '192.168.1.1';
      if (key === 'user-agent') return 'Test User Agent';
      return null;
    }),
  })),
}));
vi.mock('marked', () => ({
  marked: vi.fn((content) => `<p>${content}</p>`),
}));
vi.mock('sanitize-html', () => ({
  default: vi.fn((html) => html), // Pass through for testing
}));

describe('Admin Email Actions', () => {
  const mockSession = {
    user: {
      id: 'admin-123',
      email: 'admin@example.com',
      name: 'Admin User',
    },
  };

  const mockAdminUser = {
    id: 'admin-123',
    email: 'admin@example.com',
    is_admin: true,
    language: 'en',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    vi.mocked(auth.getAuthSession).mockResolvedValue(mockSession as any);
    vi.mocked(adminNotifications.getAdminEmails).mockReturnValue(['admin@example.com']);
    vi.mocked(adminRateLimiter.checkAdminRateLimit).mockResolvedValue(undefined);
    vi.mocked(unsubscribeTokens.generateUnsubscribeUrl).mockResolvedValue(
      'https://example.com/unsubscribe?token=test-token'
    );

    // Mock database queries
    (db as any).query = {
      users: {
        findFirst: vi.fn().mockResolvedValue(mockAdminUser),
      },
      emailTemplatesTable: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    (db as any).select = vi.fn().mockReturnThis();
    (db as any).from = vi.fn().mockReturnThis();
    (db as any).leftJoin = vi.fn().mockReturnThis();
    (db as any).where = vi.fn().mockReturnThis();
    (db as any).orderBy = vi.fn().mockReturnThis();
    (db as any).limit = vi.fn().mockReturnThis();
    (db as any).offset = vi.fn().mockReturnThis();
    (db as any).insert = vi.fn().mockReturnThis();
    (db as any).values = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication and Authorization', () => {
    it('should check admin authentication for protected actions', async () => {
      await getEmailStats();

      expect(auth.getAuthSession).toHaveBeenCalled();
      expect(db.query.users.findFirst).toHaveBeenCalled();
    });

    it('should reject unauthorized users', async () => {
      vi.mocked(auth.getAuthSession).mockResolvedValue(null);

      const result = await getEmailStats();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unauthorized');
    });

    it('should fallback to environment variable for admin check', async () => {
      (db.query.users.findFirst as any).mockResolvedValue({ ...mockAdminUser, is_admin: false });
      vi.mocked(adminNotifications.getAdminEmails).mockReturnValue(['admin@example.com']);

      const result = await getEmailStats();

      expect(result.success).toBe(true);
      expect(adminNotifications.getAdminEmails).toHaveBeenCalled();
    });

    it('should reject non-admin users', async () => {
      (db.query.users.findFirst as any).mockResolvedValue({ ...mockAdminUser, is_admin: false });
      vi.mocked(adminNotifications.getAdminEmails).mockReturnValue([]);

      const result = await getEmailStats();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Admin access required');
    });
  });

  describe('getEmailStats', () => {
    it('should return email statistics', async () => {
      const selectMock = vi.fn();
      (db as any).select = selectMock;

      selectMock
        .mockReturnValueOnce({
          from: vi.fn().mockResolvedValue([{ count: 100 }]),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 80 }]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 5 }]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 25 }]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 60 }]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  { sentAt: new Date('2025-01-01T00:00:00Z') },
                ]),
              }),
            }),
          }),
        });

      const result = await getEmailStats();

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('totalUsers');
      expect(result.data).toHaveProperty('subscribedUsers');
      expect(result.data).toHaveProperty('sentToday');
      expect(result.data).toHaveProperty('sentThisWeek');
      expect(result.data).toHaveProperty('sentThisMonth');
    });

    it('should check rate limits', async () => {
      await getEmailStats();

      expect(adminRateLimiter.checkAdminRateLimit).toHaveBeenCalledWith('admin-123', 'general');
    });

    it('should handle database errors', async () => {
      const selectMock = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockRejectedValue(new Error('Database error')),
      }));

      (db as any).select = selectMock;

      const result = await getEmailStats();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('getEmailRecipients', () => {
    it('should return test mode recipient for admin', async () => {
      const result = await getEmailRecipients({ testMode: true });

      expect(result.success).toBe(true);
      expect(result.data?.recipients).toHaveLength(1);
      expect(result.data?.recipients[0]).toEqual({
        id: 'admin-123',
        email: 'admin@example.com',
        name: 'Admin User',
        language: 'en',
      });
    });

    it('should return eligible users for production mode', async () => {
      const mockUsers = [
        { id: 'user-1', email: 'user1@example.com', name: 'User 1', language: 'en' },
        { id: 'user-2', email: 'user2@example.com', name: 'User 2', language: 'tr' },
      ];

      (db as any).select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(mockUsers),
          }),
        }),
      });

      const result = await getEmailRecipients({ testMode: false });

      expect(result.success).toBe(true);
      expect(result.data?.recipients).toEqual(mockUsers);
      expect(result.data?.count).toBe(2);
    });

    it('should filter by segment', async () => {
      await getEmailRecipients({ segment: 'developer', testMode: false });

      // Verify the query was made
      expect(db.select).toHaveBeenCalled();
    });
  });

  describe('sendBulkProductUpdate', () => {
    it('should send emails to recipients', async () => {
      const mockRecipients = [
        { id: 'user-1', email: 'user1@example.com', name: 'User 1', language: 'en' },
      ];

      (db.query.users.findFirst as any).mockResolvedValue(mockAdminUser);
      (db as any).select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(mockRecipients),
          }),
        }),
      });

      vi.mocked(email.sendEmail).mockResolvedValue(true as any);

      const result = await sendBulkProductUpdate({
        subject: 'Test Subject',
        markdownContent: 'Test Content',
        segment: 'all',
        testMode: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.sent).toBe(1);
      expect(result.data?.failed).toBe(0);
      expect(email.sendEmail).toHaveBeenCalled();
    });

    it('should use translated content for user language', async () => {
      const mockRecipients = [
        { id: 'user-1', email: 'user1@example.com', name: 'User 1', language: 'tr' },
      ];

      (db.query.users.findFirst as any).mockResolvedValue({
        ...mockAdminUser,
        language: 'tr',
      });

      const translations = {
        original: { language: 'en', subject: 'Test', content: 'Content' },
        translations: [
          { language: 'en', subject: 'Test', content: 'Content', success: true },
          { language: 'tr', subject: 'Test TR', content: 'İçerik TR', success: true },
        ],
      };

      vi.mocked(email.sendEmail).mockResolvedValue(true as any);

      const result = await sendBulkProductUpdate({
        subject: 'Test',
        markdownContent: 'Content',
        segment: 'all',
        testMode: true,
        translations: translations as any,
      });

      expect(result.success).toBe(true);
      expect(email.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Test TR',
        })
      );
    });

    it('should check rate limits for email campaigns', async () => {
      await sendBulkProductUpdate({
        subject: 'Test',
        markdownContent: 'Content',
        segment: 'all',
        testMode: true,
      });

      expect(adminRateLimiter.checkAdminRateLimit).toHaveBeenCalledWith('admin-123', 'email');
    });

    it('should track sent emails', async () => {
      (db.query.users.findFirst as any).mockResolvedValue(mockAdminUser);
      vi.mocked(email.sendEmail).mockResolvedValue(true as any);

      await sendBulkProductUpdate({
        subject: 'Test',
        markdownContent: 'Content',
        segment: 'all',
        testMode: true,
      });

      expect(db.insert).toHaveBeenCalled();
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          emailType: 'product_update',
          subject: 'Test',
        })
      );
    });

    it('should handle email sending failures', async () => {
      (db.query.users.findFirst as any).mockResolvedValue(mockAdminUser);
      vi.mocked(email.sendEmail).mockResolvedValue(false as any);

      const result = await sendBulkProductUpdate({
        subject: 'Test',
        markdownContent: 'Content',
        segment: 'all',
        testMode: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.sent).toBe(0);
      expect(result.data?.failed).toBe(1);
    });

    it('should process emails in batches', async () => {
      const mockRecipients = Array.from({ length: 25 }, (_, i) => ({
        id: `user-${i}`,
        email: `user${i}@example.com`,
        name: `User ${i}`,
        language: 'en',
      }));

      (db as any).select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(mockRecipients),
          }),
        }),
      });

      vi.mocked(email.sendEmail).mockResolvedValue(true as any);

      const result = await sendBulkProductUpdate({
        subject: 'Test',
        markdownContent: 'Content',
        segment: 'all',
        testMode: false,
      });

      // With batch size of 10, 25 recipients should be processed in 3 batches
      expect(result.success).toBe(true);
      expect(result.data?.sent).toBe(25);
      expect(email.sendEmail).toHaveBeenCalledTimes(25);
    });
  });

  describe('translateEmailContent', () => {
    it('should translate email content', async () => {
      const mockTranslations = {
        original: { language: 'en', subject: 'Test', content: 'Content' },
        translations: [
          { language: 'en', subject: 'Test', content: 'Content', success: true },
          { language: 'tr', subject: 'Test TR', content: 'İçerik TR', success: true },
        ],
      };

      vi.mocked(emailTranslationService.translateToAllLanguages).mockResolvedValue(
        mockTranslations as any
      );

      const result = await translateEmailContent({
        subject: 'Test',
        content: 'Content',
        sourceLanguage: 'en',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockTranslations);
      expect(emailTranslationService.translateToAllLanguages).toHaveBeenCalledWith(
        'Test',
        'Content',
        'en'
      );
    });

    it('should check rate limits for translation', async () => {
      vi.mocked(emailTranslationService.translateToAllLanguages).mockResolvedValue({
        original: { language: 'en', subject: 'Test', content: 'Content' },
        translations: [],
      } as any);

      await translateEmailContent({
        subject: 'Test',
        content: 'Content',
        sourceLanguage: 'en',
      });

      expect(adminRateLimiter.checkAdminRateLimit).toHaveBeenCalledWith('admin-123', 'general');
    });

    it('should log translation action', async () => {
      const insertSpy = vi.fn().mockResolvedValue(undefined);
      (db as any).insert.mockReturnValue({ values: insertSpy });

      vi.mocked(emailTranslationService.translateToAllLanguages).mockResolvedValue({
        original: { language: 'en', subject: 'Test', content: 'Content' },
        translations: [],
      } as any);

      await translateEmailContent({
        subject: 'Test',
        content: 'Content',
        sourceLanguage: 'en',
      });

      expect(db.insert).toHaveBeenCalled();
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'email_translate',
        })
      );
    });

    it('should handle translation errors', async () => {
      vi.mocked(emailTranslationService.translateToAllLanguages).mockRejectedValue(
        new Error('Translation failed')
      );

      const result = await translateEmailContent({
        subject: 'Test',
        content: 'Content',
        sourceLanguage: 'en',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Translation failed');
    });
  });

  describe('Email Templates', () => {
    it('should save email template', async () => {
      const newTemplate = {
        id: 'test-template',
        name: 'Test Template',
        subject: 'Test Subject',
        content: 'Test Content',
        category: 'product_update',
        variables: [],
      };

      (db.query.emailTemplatesTable.findFirst as any).mockResolvedValue(null);

      (db as any).insert = vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([newTemplate]),
        })),
      }));

      const result = await saveEmailTemplate({
        name: 'Test Template',
        subject: 'Test Subject',
        content: 'Test Content',
        category: 'product_update',
      });

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(newTemplate.id);
      expect(result.data?.name).toBe(newTemplate.name);
    });

    it('should get email templates with defaults', async () => {
      (db as any).select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([
              { id: 'template-1', name: 'Template 1' },
            ]),
          }),
        }),
      });

      const result = await getEmailTemplates();

      expect(result.success).toBe(true);
      expect(result.data).toBeInstanceOf(Array);
      expect(result.data?.length).toBeGreaterThan(0);
    });

    it('should validate template input', async () => {
      const result = await saveEmailTemplate({
        name: '',
        subject: 'Test',
        content: 'Content',
        category: 'other',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('too_small');
    });
  });

  describe('getEmailHistory', () => {
    it('should return email history', async () => {
      const mockHistory = [
        {
          id: 'email-1',
          emailType: 'product_update',
          subject: 'Test Email',
          sentAt: new Date(),
          segment: 'all',
          metadata: {},
        },
      ];

      (db as any).select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue(mockHistory),
              }),
            }),
          }),
        }),
      });

      const result = await getEmailHistory({ limit: 50, offset: 0 });

      expect(result.success).toBe(true);
      expect(result.data?.history).toEqual(mockHistory);
    });

    it('should support pagination', async () => {
      (db as any).select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                offset: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      });

      await getEmailHistory({ limit: 10, offset: 20 });

      expect(db.select).toHaveBeenCalled();
    });
  });

  describe('Audit Logging', () => {
    it('should log admin actions', async () => {
      const insertSpy = vi.fn().mockResolvedValue(undefined);
      (db as any).insert.mockReturnValue({ values: insertSpy });

      vi.mocked(email.sendEmail).mockResolvedValue(true as any);
      (db.query.users.findFirst as any).mockResolvedValue(mockAdminUser);

      await sendBulkProductUpdate({
        subject: 'Test',
        markdownContent: 'Content',
        segment: 'all',
        testMode: true,
      });

      // Check that audit log was created
      const auditCalls = insertSpy.mock.calls.filter(
        call => call[0].action === 'send_bulk_email'
      );

      expect(auditCalls.length).toBeGreaterThan(0);
      expect(auditCalls[0][0]).toMatchObject({
        adminId: 'admin-123',
        action: 'send_bulk_email',
        targetType: 'email_campaign',
        ipAddress: '192.168.1.1',
        userAgent: 'Test User Agent',
      });
    });

    it('should not fail action if audit logging fails', async () => {
      // Make audit logging fail
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const insertSpy = vi.fn()
        .mockImplementationOnce(() => { throw new Error('Audit log failed'); })
        .mockResolvedValue(undefined);

      (db as any).insert.mockReturnValue({ values: insertSpy });

      const result = await getEmailStats();

      // Action should still succeed even if audit logging fails
      expect(result.success).toBe(true);
      expect(consoleSpy).not.toHaveBeenCalled(); // getEmailStats doesn't log actions
    });
  });
});
