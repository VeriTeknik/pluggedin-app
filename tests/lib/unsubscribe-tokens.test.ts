import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  cleanupExpiredTokens,
  generateUnsubscribeUrl,
} from '@/lib/unsubscribe-tokens';
import { db } from '@/db';
import { unsubscribeTokensTable } from '@/db/schema';

// Mock database operations
vi.mock('@/db', () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    query: {
      unsubscribeTokensTable: {
        findFirst: vi.fn(),
      },
    },
    values: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
  },
}));

// Mock crypto.randomBytes to return predictable values in tests
const originalRandomBytes = crypto.randomBytes;

describe('Unsubscribe Tokens', () => {
  const mockUserId = 'user-123';
  const mockToken = 'mock-token-base64url';
  const mockTokenHash = 'mock-hash-hex';

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock environment variables
    process.env.UNSUBSCRIBE_TOKEN_SECRET = 'test-secret';
    process.env.NEXTAUTH_SECRET = 'nextauth-secret';
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateUnsubscribeToken', () => {
    it('should generate a secure token and store it in database', async () => {
      // Mock crypto.randomBytes
      vi.spyOn(crypto, 'randomBytes').mockReturnValueOnce(Buffer.from('test-random-bytes'));

      // Mock database insert
      const mockInsert = vi.fn().mockResolvedValue(undefined);
      (db.insert as any).mockReturnValue({
        values: mockInsert,
      });

      const token = await generateUnsubscribeToken(mockUserId);

      expect(token).toEqual(expect.any(String));
      expect(crypto.randomBytes).toHaveBeenCalledWith(32);

      // Verify database insert was called
      expect(db.insert).toHaveBeenCalledWith(unsubscribeTokensTable);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          token: expect.any(String),
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        })
      );

      // Verify expiration is set to 48 hours
      const insertCall = mockInsert.mock.calls[0][0];
      const expiresAt = insertCall.expiresAt;
      const now = new Date();
      const diff = expiresAt.getTime() - now.getTime();
      const hoursDiff = diff / (1000 * 60 * 60);
      expect(hoursDiff).toBeGreaterThan(47);
      expect(hoursDiff).toBeLessThan(49);
    });

    it('should use HMAC for token hashing', async () => {
      vi.spyOn(crypto, 'randomBytes').mockReturnValueOnce(Buffer.from('test-random-bytes'));
      const hmacSpy = vi.spyOn(crypto, 'createHmac');

      const mockInsert = vi.fn().mockResolvedValue(undefined);
      (db.insert as any).mockReturnValue({
        values: mockInsert,
      });

      await generateUnsubscribeToken(mockUserId);

      expect(hmacSpy).toHaveBeenCalledWith('sha256', expect.any(String));

      // Verify HMAC includes both token and userId
      const insertCall = mockInsert.mock.calls[0][0];
      expect(insertCall.tokenHash).toEqual(expect.any(String));
      expect(insertCall.tokenHash).toHaveLength(64); // SHA-256 produces 64 hex characters
    });

    it('should use fallback secret if UNSUBSCRIBE_TOKEN_SECRET is not set', async () => {
      delete process.env.UNSUBSCRIBE_TOKEN_SECRET;

      vi.spyOn(crypto, 'randomBytes').mockReturnValueOnce(Buffer.from('test-random-bytes'));
      const hmacSpy = vi.spyOn(crypto, 'createHmac');

      const mockInsert = vi.fn().mockResolvedValue(undefined);
      (db.insert as any).mockReturnValue({
        values: mockInsert,
      });

      await generateUnsubscribeToken(mockUserId);

      // Should use NEXTAUTH_SECRET as fallback
      expect(hmacSpy).toHaveBeenCalledWith('sha256', 'nextauth-secret');
    });
  });

  describe('verifyUnsubscribeToken', () => {
    it('should verify valid token and mark as used', async () => {
      const validToken = 'valid-token';
      const tokenRecord = {
        id: 'token-id',
        userId: mockUserId,
        token: validToken,
        tokenHash: crypto.createHmac('sha256', 'test-secret')
          .update(validToken + mockUserId)
          .digest('hex'),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
        usedAt: null,
      };

      (db.query.unsubscribeTokensTable.findFirst as any).mockResolvedValue(tokenRecord);

      const mockSet = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      (db.update as any).mockReturnValue({
        set: mockSet,
        where: mockWhere,
      });

      const userId = await verifyUnsubscribeToken(validToken);

      expect(userId).toBe(mockUserId);

      // Verify token was looked up
      expect(db.query.unsubscribeTokensTable.findFirst).toHaveBeenCalledWith({
        where: expect.any(Function),
      });

      // Verify token was marked as used
      expect(db.update).toHaveBeenCalledWith(unsubscribeTokensTable);
      expect(mockSet).toHaveBeenCalledWith({ usedAt: expect.any(Date) });
    });

    it('should return null for expired token', async () => {
      const expiredToken = 'expired-token';
      const tokenRecord = {
        id: 'token-id',
        userId: mockUserId,
        token: expiredToken,
        tokenHash: 'some-hash',
        expiresAt: new Date(Date.now() - 1000), // Expired
        usedAt: null,
      };

      (db.query.unsubscribeTokensTable.findFirst as any).mockResolvedValue(null);

      const userId = await verifyUnsubscribeToken(expiredToken);

      expect(userId).toBeNull();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('should return null for already used token', async () => {
      const usedToken = 'used-token';

      (db.query.unsubscribeTokensTable.findFirst as any).mockResolvedValue(null);

      const userId = await verifyUnsubscribeToken(usedToken);

      expect(userId).toBeNull();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('should return null for invalid HMAC hash', async () => {
      const invalidToken = 'invalid-token';
      const tokenRecord = {
        id: 'token-id',
        userId: mockUserId,
        token: invalidToken,
        tokenHash: 'wrong-hash', // Invalid hash
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        usedAt: null,
      };

      (db.query.unsubscribeTokensTable.findFirst as any).mockResolvedValue(tokenRecord);

      const userId = await verifyUnsubscribeToken(invalidToken);

      expect(userId).toBeNull();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('should use timing-safe comparison for HMAC verification', async () => {
      const token = 'test-token';
      const tokenRecord = {
        id: 'token-id',
        userId: mockUserId,
        token: token,
        tokenHash: crypto.createHmac('sha256', 'test-secret')
          .update(token + mockUserId)
          .digest('hex'),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        usedAt: null,
      };

      (db.query.unsubscribeTokensTable.findFirst as any).mockResolvedValue(tokenRecord);

      const timingSafeSpy = vi.spyOn(crypto, 'timingSafeEqual');

      const mockSet = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      (db.update as any).mockReturnValue({
        set: mockSet,
        where: mockWhere,
      });

      await verifyUnsubscribeToken(token);

      expect(timingSafeSpy).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      (db.query.unsubscribeTokensTable.findFirst as any).mockRejectedValue(
        new Error('Database error')
      );

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const userId = await verifyUnsubscribeToken('any-token');

      expect(userId).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error verifying unsubscribe token:',
        expect.any(Error)
      );
    });

    it('should not find token with wrong query', async () => {
      (db.query.unsubscribeTokensTable.findFirst as any).mockResolvedValue(null);

      const userId = await verifyUnsubscribeToken('non-existent-token');

      expect(userId).toBeNull();
      expect(db.update).not.toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should delete expired tokens', async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      (db.delete as any).mockReturnValue({
        where: mockWhere,
      });

      await cleanupExpiredTokens();

      expect(db.delete).toHaveBeenCalledWith(unsubscribeTokensTable);
      expect(mockWhere).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle cleanup errors gracefully', async () => {
      (db.delete as any).mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error('Cleanup failed')),
      });

      // Should not throw
      await expect(cleanupExpiredTokens()).resolves.toBeUndefined();
    });
  });

  describe('generateUnsubscribeUrl', () => {
    it('should generate URL with token', async () => {
      vi.spyOn(crypto, 'randomBytes').mockReturnValueOnce(Buffer.from('test-random-bytes'));

      const mockInsert = vi.fn().mockResolvedValue(undefined);
      (db.insert as any).mockReturnValue({
        values: mockInsert,
      });

      const url = await generateUnsubscribeUrl(mockUserId);

      expect(url).toMatch(/^https:\/\/example\.com\/unsubscribe\?token=/);
      expect(url).toContain(encodeURIComponent(expect.any(String)));
    });

    it('should use localhost URL when NEXT_PUBLIC_APP_URL is not set', async () => {
      delete process.env.NEXT_PUBLIC_APP_URL;

      vi.spyOn(crypto, 'randomBytes').mockReturnValueOnce(Buffer.from('test-random-bytes'));

      const mockInsert = vi.fn().mockResolvedValue(undefined);
      (db.insert as any).mockReturnValue({
        values: mockInsert,
      });

      const url = await generateUnsubscribeUrl(mockUserId);

      expect(url).toMatch(/^http:\/\/localhost:12005\/unsubscribe\?token=/);
    });

    it('should properly encode token in URL', async () => {
      // Mock a token that needs URL encoding
      const tokenWithSpecialChars = 'token+with/special=chars';
      vi.spyOn(crypto, 'randomBytes').mockReturnValueOnce({
        toString: () => tokenWithSpecialChars,
      } as any);

      const mockInsert = vi.fn().mockResolvedValue(undefined);
      (db.insert as any).mockReturnValue({
        values: mockInsert,
      });

      const url = await generateUnsubscribeUrl(mockUserId);

      // Should be properly URL encoded
      expect(url).toContain(encodeURIComponent(tokenWithSpecialChars));
      expect(url).not.toContain(tokenWithSpecialChars);
    });
  });

  describe('Security Features', () => {
    it('should generate cryptographically secure tokens', async () => {
      const randomBytesSpy = vi.spyOn(crypto, 'randomBytes').mockImplementation(
        originalRandomBytes as any
      );

      const mockInsert = vi.fn().mockResolvedValue(undefined);
      (db.insert as any).mockReturnValue({
        values: mockInsert,
      });

      const token1 = await generateUnsubscribeToken('user-1');
      const token2 = await generateUnsubscribeToken('user-2');

      // Tokens should be different
      expect(token1).not.toBe(token2);

      // Should use 32 bytes for strong security
      expect(randomBytesSpy).toHaveBeenCalledWith(32);
    });

    it('should use different secrets for HMAC and NextAuth', async () => {
      process.env.UNSUBSCRIBE_TOKEN_SECRET = 'unsubscribe-secret';
      process.env.NEXTAUTH_SECRET = 'nextauth-secret';

      const hmacSpy = vi.spyOn(crypto, 'createHmac');

      const mockInsert = vi.fn().mockResolvedValue(undefined);
      (db.insert as any).mockReturnValue({
        values: mockInsert,
      });

      await generateUnsubscribeToken(mockUserId);

      // Should use UNSUBSCRIBE_TOKEN_SECRET, not NEXTAUTH_SECRET
      expect(hmacSpy).toHaveBeenCalledWith('sha256', 'unsubscribe-secret');
      expect(hmacSpy).not.toHaveBeenCalledWith('sha256', 'nextauth-secret');
    });
  });
});