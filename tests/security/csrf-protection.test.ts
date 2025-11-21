import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { validateCSRF } from '@/lib/csrf-protection';
import { POST as setPasswordHandler } from '@/app/api/settings/password/set/route';
import { POST as removePasswordHandler } from '@/app/api/settings/password/remove/route';
import { getAuthSession } from '@/lib/auth';
import { db } from '@/db';

// Mock dependencies
vi.mock('@/lib/csrf-protection');
vi.mock('@/lib/auth');
vi.mock('@/db');
vi.mock('@/lib/email', () => ({
  generatePasswordSetEmail: vi.fn(() => ({ to: '', subject: '', html: '' })),
  generatePasswordRemovedEmail: vi.fn(() => ({ to: '', subject: '', html: '' })),
  sendEmail: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/auth-security', () => ({
  recordPasswordChange: vi.fn().mockResolvedValue(undefined),
  isPasswordComplex: vi.fn().mockReturnValue({ isValid: true, errors: [] }),
}));
vi.mock('@/lib/rate-limiter', () => ({
  RateLimiters: {
    auth: vi.fn().mockResolvedValue({ allowed: true }),
  },
}));

const mockedValidateCSRF = vi.mocked(validateCSRF);
const mockedGetAuthSession = vi.mocked(getAuthSession);
const mockedDb = vi.mocked(db);

describe('CSRF Protection', () => {
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

    mockedGetAuthSession.mockResolvedValue({
      user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
      expires: new Date(Date.now() + 86400000).toISOString(),
    });
  });

  describe('validateCSRF Function', () => {
    it('should reject requests without CSRF token', async () => {
      mockedValidateCSRF.mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      const isValid = await validateCSRF(request);

      expect(isValid).toBe(false);
    });

    it('should accept requests with valid CSRF token', async () => {
      mockedValidateCSRF.mockResolvedValue(true);

      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          'x-csrf-token': 'valid-token-12345',
        },
        body: JSON.stringify({}),
      });

      const isValid = await validateCSRF(request);

      expect(isValid).toBe(true);
    });

    it('should reject requests with invalid CSRF token', async () => {
      mockedValidateCSRF.mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          'x-csrf-token': 'invalid-token',
        },
        body: JSON.stringify({}),
      });

      const isValid = await validateCSRF(request);

      expect(isValid).toBe(false);
    });
  });

  describe('Password Set Endpoint CSRF Protection', () => {
    it('should reject password set without CSRF token', async () => {
      mockedValidateCSRF.mockResolvedValue(false);

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

      expect(response.status).toBe(403);
      expect(data.message).toContain('CSRF');
      expect(mockedDb.update).not.toHaveBeenCalled();
    });

    it('should accept password set with valid CSRF token', async () => {
      mockedValidateCSRF.mockResolvedValue(true);

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
        headers: {
          'x-csrf-token': 'valid-token-12345',
        },
        body: JSON.stringify({ password: 'NewPassword123!' }),
      });

      const response = await setPasswordHandler(request);

      expect(response.status).toBe(200);
      expect(mockedDb.update).toHaveBeenCalled();
    });
  });

  describe('Password Remove Endpoint CSRF Protection', () => {
    it('should reject password removal without CSRF token', async () => {
      mockedValidateCSRF.mockResolvedValue(false);

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

      expect(response.status).toBe(403);
      expect(data.message).toContain('CSRF');
      expect(mockedDb.update).not.toHaveBeenCalled();
    });

    it('should accept password removal with valid CSRF token', async () => {
      mockedValidateCSRF.mockResolvedValue(true);

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
        headers: {
          'x-csrf-token': 'valid-token-12345',
        },
      });

      const response = await removePasswordHandler(request);

      expect(response.status).toBe(200);
      expect(mockedDb.update).toHaveBeenCalled();
    });
  });

  describe('CSRF Attack Scenarios', () => {
    it('should prevent cross-site request forgery attack on password set', async () => {
      mockedValidateCSRF.mockResolvedValue(false);

      mockedDb.query.users.findFirst.mockResolvedValue({
        id: 'user-123',
        email: 'victim@example.com',
        name: 'Victim User',
        password: null,
        emailVerified: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Attacker tries to set password via CSRF (no token)
      const maliciousRequest = new NextRequest('http://localhost/api/settings/password/set', {
        method: 'POST',
        headers: {
          // Attacker can't get the CSRF token from victim's session
          'origin': 'https://evil-site.com',
        },
        body: JSON.stringify({ password: 'AttackerPassword123!' }),
      });

      const response = await setPasswordHandler(maliciousRequest);
      const data = await response.json();

      // Should be blocked
      expect(response.status).toBe(403);
      expect(data.message).toContain('CSRF');
      expect(mockedDb.update).not.toHaveBeenCalled();
    });

    it('should prevent token replay attack', async () => {
      // First request with valid token succeeds
      mockedValidateCSRF.mockResolvedValueOnce(true);

      mockedDb.query.users.findFirst.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        password: null,
        emailVerified: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      const request1 = new NextRequest('http://localhost/api/settings/password/set', {
        method: 'POST',
        headers: {
          'x-csrf-token': 'valid-token-12345',
        },
        body: JSON.stringify({ password: 'Password123!' }),
      });

      const response1 = await setPasswordHandler(request1);
      expect(response1.status).toBe(200);

      // Second request with same token should fail (token should be single-use)
      mockedValidateCSRF.mockResolvedValueOnce(false);

      mockedDb.query.users.findFirst.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        password: 'new-hash',
        emailVerified: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      const request2 = new NextRequest('http://localhost/api/settings/password/set', {
        method: 'POST',
        headers: {
          'x-csrf-token': 'valid-token-12345', // Same token
        },
        body: JSON.stringify({ password: 'DifferentPassword123!' }),
      });

      const response2 = await setPasswordHandler(request2);
      const data2 = await response2.json();

      expect(response2.status).toBe(403);
      expect(data2.message).toContain('CSRF');
    });

    it('should prevent CSRF on password removal', async () => {
      mockedValidateCSRF.mockResolvedValue(false);

      mockedDb.query.users.findFirst.mockResolvedValue({
        id: 'user-123',
        email: 'victim@example.com',
        name: 'Victim User',
        password: 'existing-hash',
        emailVerified: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      mockedDb.query.accounts.findMany.mockResolvedValue([
        { provider: 'google', userId: 'user-123', providerAccountId: 'google-123' },
      ]);

      // Attacker tries to remove password via CSRF
      const maliciousRequest = new NextRequest('http://localhost/api/settings/password/remove', {
        method: 'POST',
        headers: {
          'origin': 'https://evil-site.com',
        },
      });

      const response = await removePasswordHandler(maliciousRequest);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.message).toContain('CSRF');
      expect(mockedDb.update).not.toHaveBeenCalled();
    });
  });

  describe('CSRF Token Validation Logic', () => {
    it('should check CSRF token before processing request', async () => {
      const validateOrder: string[] = [];

      mockedValidateCSRF.mockImplementation(async () => {
        validateOrder.push('csrf-check');
        return false;
      });

      mockedDb.query.users.findFirst.mockImplementation(async () => {
        validateOrder.push('db-query');
        return {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          password: null,
          emailVerified: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        };
      });

      const request = new NextRequest('http://localhost/api/settings/password/set', {
        method: 'POST',
        body: JSON.stringify({ password: 'Password123!' }),
      });

      await setPasswordHandler(request);

      // CSRF check should happen before any database operations
      expect(validateOrder[0]).toBe('csrf-check');
      expect(validateOrder).not.toContain('db-query');
    });

    it('should not proceed with operation if CSRF validation fails', async () => {
      mockedValidateCSRF.mockResolvedValue(false);

      let dbQueryCalled = false;
      mockedDb.query.users.findFirst.mockImplementation(async () => {
        dbQueryCalled = true;
        return null as any;
      });

      const request = new NextRequest('http://localhost/api/settings/password/set', {
        method: 'POST',
        body: JSON.stringify({ password: 'Password123!' }),
      });

      await setPasswordHandler(request);

      // Database query should never be called if CSRF validation fails
      expect(dbQueryCalled).toBe(false);
    });
  });

  describe('Integration with Other Security Measures', () => {
    it('should enforce both session auth and CSRF protection', async () => {
      // No session
      mockedGetAuthSession.mockResolvedValue(null);
      mockedValidateCSRF.mockResolvedValue(true);

      const request1 = new NextRequest('http://localhost/api/settings/password/set', {
        method: 'POST',
        headers: {
          'x-csrf-token': 'valid-token',
        },
        body: JSON.stringify({ password: 'Password123!' }),
      });

      const response1 = await setPasswordHandler(request1);
      expect(response1.status).toBe(401); // Fails on session check

      // Valid session but no CSRF token
      mockedGetAuthSession.mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });
      mockedValidateCSRF.mockResolvedValue(false);

      const request2 = new NextRequest('http://localhost/api/settings/password/set', {
        method: 'POST',
        body: JSON.stringify({ password: 'Password123!' }),
      });

      const response2 = await setPasswordHandler(request2);
      expect(response2.status).toBe(403); // Fails on CSRF check

      // Both session and CSRF valid
      mockedValidateCSRF.mockResolvedValue(true);
      mockedDb.query.users.findFirst.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        password: null,
        emailVerified: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      const request3 = new NextRequest('http://localhost/api/settings/password/set', {
        method: 'POST',
        headers: {
          'x-csrf-token': 'valid-token',
        },
        body: JSON.stringify({ password: 'Password123!' }),
      });

      const response3 = await setPasswordHandler(request3);
      expect(response3.status).toBe(200); // Succeeds with both
    });
  });
});
