import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { POST as setPasswordHandler } from '@/app/api/settings/password/set/route';
import { POST as removePasswordHandler } from '@/app/api/settings/password/remove/route';
import { POST as changePasswordHandler } from '@/app/api/settings/password/route';
import { db } from '@/db';
import { getAuthSession } from '@/lib/auth';
import { validateCSRF } from '@/lib/csrf-protection';
import { sendEmail } from '@/lib/email';
import { recordPasswordChange } from '@/lib/auth-security';

// Mock dependencies
vi.mock('@/db');
vi.mock('@/lib/auth');
vi.mock('@/lib/csrf-protection');
vi.mock('@/lib/email');
vi.mock('@/lib/auth-security', () => ({
  recordPasswordChange: vi.fn().mockResolvedValue(undefined),
  isPasswordComplex: vi.fn().mockReturnValue({ isValid: true, errors: [] }),
}));
vi.mock('@/lib/rate-limiter', () => ({
  RateLimiters: {
    auth: vi.fn().mockResolvedValue({ allowed: true }),
  },
}));

const mockedDb = vi.mocked(db);
const mockedGetAuthSession = vi.mocked(getAuthSession);
const mockedValidateCSRF = vi.mocked(validateCSRF);
const mockedSendEmail = vi.mocked(sendEmail);
const mockedRecordPasswordChange = vi.mocked(recordPasswordChange);

describe('Password Management Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockedDb.query = {
      users: {
        findFirst: vi.fn(),
      },
      accounts: {
        findMany: vi.fn(),
      },
    } as any;

    mockedDb.update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })) as any;

    mockedValidateCSRF.mockResolvedValue(true);
    mockedSendEmail.mockResolvedValue(true);
    mockedRecordPasswordChange.mockResolvedValue(undefined);
  });

  describe('POST /api/settings/password/set - Set Password', () => {
    it('should reject requests without valid session', async () => {
      mockedGetAuthSession.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/settings/password/set', {
        method: 'POST',
        body: JSON.stringify({ password: 'NewPassword123!' }),
      });

      const response = await setPasswordHandler(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.message).toBe('Unauthorized');
      expect(mockedDb.update).not.toHaveBeenCalled();
    });

    it('should reject requests without CSRF token', async () => {
      mockedGetAuthSession.mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });
      mockedValidateCSRF.mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/settings/password/set', {
        method: 'POST',
        body: JSON.stringify({ password: 'NewPassword123!' }),
      });

      const response = await setPasswordHandler(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.message).toContain('CSRF');
      expect(mockedDb.update).not.toHaveBeenCalled();
    });

    it('should reject weak passwords', async () => {
      mockedGetAuthSession.mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      const request = new NextRequest('http://localhost/api/settings/password/set', {
        method: 'POST',
        body: JSON.stringify({ password: 'weak' }),
      });

      const response = await setPasswordHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.message).toContain('complexity');
      expect(mockedDb.update).not.toHaveBeenCalled();
    });

    it('should reject if user already has a password', async () => {
      mockedGetAuthSession.mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      mockedDb.query.users.findFirst.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        password: 'existing-hash',
        emailVerified: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      const request = new NextRequest('http://localhost/api/settings/password/set', {
        method: 'POST',
        body: JSON.stringify({ password: 'NewPassword123!' }),
      });

      const response = await setPasswordHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.message).toContain('already has a password');
      expect(mockedDb.update).not.toHaveBeenCalled();
    });

    it('should successfully set password and send notification email', async () => {
      mockedGetAuthSession.mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      mockedDb.query.users.findFirst.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        password: null,
        emailVerified: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      const request = new NextRequest('http://localhost/api/settings/password/set', {
        method: 'POST',
        body: JSON.stringify({ password: 'NewPassword123!' }),
      });

      const response = await setPasswordHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Password set successfully');
      expect(mockedDb.update).toHaveBeenCalled();
      expect(mockedSendEmail).toHaveBeenCalled();
      expect(mockedRecordPasswordChange).toHaveBeenCalledWith(
        'user-123',
        'password_set'
      );
    });
  });

  describe('POST /api/settings/password/remove - Remove Password', () => {
    it('should reject requests without valid session', async () => {
      mockedGetAuthSession.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/settings/password/remove', {
        method: 'POST',
      });

      const response = await removePasswordHandler(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.message).toBe('Unauthorized');
      expect(mockedDb.update).not.toHaveBeenCalled();
    });

    it('should reject if no OAuth accounts exist', async () => {
      mockedGetAuthSession.mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      mockedDb.query.users.findFirst.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        password: 'existing-hash',
        emailVerified: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      mockedDb.query.accounts.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/settings/password/remove', {
        method: 'POST',
      });

      const response = await removePasswordHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.message).toContain('at least one OAuth account');
      expect(mockedDb.update).not.toHaveBeenCalled();
    });

    it('should successfully remove password and send notification email', async () => {
      mockedGetAuthSession.mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      mockedDb.query.users.findFirst.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        password: 'existing-hash',
        emailVerified: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      mockedDb.query.accounts.findMany.mockResolvedValue([
        { provider: 'google', userId: 'user-123', providerAccountId: 'google-123' },
      ]);

      const request = new NextRequest('http://localhost/api/settings/password/remove', {
        method: 'POST',
      });

      const response = await removePasswordHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toContain('Password removed successfully');
      expect(mockedDb.update).toHaveBeenCalled();
      expect(mockedSendEmail).toHaveBeenCalled();
      expect(mockedRecordPasswordChange).toHaveBeenCalledWith(
        'user-123',
        'password_removed'
      );
    });
  });

  describe('POST /api/settings/password - Change Password', () => {
    it('should reject requests without valid session', async () => {
      mockedGetAuthSession.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/settings/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
        }),
      });

      const response = await changePasswordHandler(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.message).toBe('Unauthorized');
      expect(mockedDb.update).not.toHaveBeenCalled();
    });

    it('should reject if user has no password', async () => {
      mockedGetAuthSession.mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      mockedDb.query.users.findFirst.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        password: null,
        emailVerified: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      const request = new NextRequest('http://localhost/api/settings/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
        }),
      });

      const response = await changePasswordHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.message).toContain('no password set');
      expect(mockedDb.update).not.toHaveBeenCalled();
    });

    it('should send notification email on successful password change', async () => {
      const bcrypt = await import('bcrypt');
      const hashedPassword = await bcrypt.hash('OldPassword123!', 14);

      mockedGetAuthSession.mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      mockedDb.query.users.findFirst.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        password: hashedPassword,
        emailVerified: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      const request = new NextRequest('http://localhost/api/settings/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
        }),
      });

      const response = await changePasswordHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Password updated successfully');
      expect(mockedDb.update).toHaveBeenCalled();
      expect(mockedSendEmail).toHaveBeenCalled();
      expect(mockedRecordPasswordChange).toHaveBeenCalledWith(
        'user-123',
        'password_changed'
      );
    });
  });

  describe('Security Logging', () => {
    it('should log all password operations', async () => {
      const operations = ['password_set', 'password_changed', 'password_removed'];

      operations.forEach(operation => {
        mockedRecordPasswordChange.mockClear();
        mockedRecordPasswordChange('user-123', operation as any);

        expect(mockedRecordPasswordChange).toHaveBeenCalledWith('user-123', operation);
      });
    });
  });
});
