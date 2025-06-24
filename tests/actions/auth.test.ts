import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getServerSession } from 'next-auth';

import { serverLogout, verifyEmail } from '@/app/actions/auth';
import { db } from '@/db';
import { sessions, users, verificationTokens } from '@/db/schema';

// Mock dependencies
vi.mock('@/db');
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

const mockedDb = vi.mocked(db);
const mockedGetServerSession = vi.mocked(getServerSession);

describe('Authentication Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    mockedDb.query = {
      users: {
        findFirst: vi.fn(),
      },
      verificationTokens: {
        findFirst: vi.fn(),
      },
    } as any;
    mockedDb.delete = vi.fn().mockReturnThis();
    mockedDb.update = vi.fn().mockReturnThis();
    mockedDb.where = vi.fn().mockReturnThis();
    mockedDb.set = vi.fn().mockReturnThis();
  });

  describe('serverLogout', () => {
    it('should successfully logout user by deleting sessions', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      };

      mockedGetServerSession.mockResolvedValue({
        user: { email: 'test@example.com' },
      } as any);

      mockedDb.query.users.findFirst.mockResolvedValue(mockUser);
      mockedDb.where.mockResolvedValue([]);

      const result = await serverLogout();

      expect(result.success).toBe(true);
      expect(mockedDb.delete).toHaveBeenCalledWith(sessions);
      expect(mockedGetServerSession).toHaveBeenCalled();
    });

    it('should handle case when user is not logged in', async () => {
      mockedGetServerSession.mockResolvedValue(null);

      const result = await serverLogout();

      expect(result.success).toBe(true);
      expect(mockedDb.delete).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockedGetServerSession.mockResolvedValue({
        user: { email: 'test@example.com' },
      } as any);

      mockedDb.query.users.findFirst.mockRejectedValue(new Error('Database error'));

      const result = await serverLogout();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to logout');
    });
  });

  describe('verifyEmail', () => {
    it('should successfully verify email with valid token', async () => {
      const mockToken = {
        token: 'valid-token',
        identifier: 'test@example.com',
      };

      mockedDb.query.verificationTokens.findFirst.mockResolvedValue(mockToken);
      mockedDb.where.mockResolvedValue([]);

      const result = await verifyEmail('valid-token');

      expect(result.success).toBe(true);
      expect(mockedDb.update).toHaveBeenCalledWith(users);
      expect(mockedDb.delete).toHaveBeenCalledWith(verificationTokens);
    });

    it('should throw error for invalid token', async () => {
      mockedDb.query.verificationTokens.findFirst.mockResolvedValue(null);

      await expect(verifyEmail('invalid-token')).rejects.toThrow(
        'Invalid or expired verification token'
      );
    });

    it('should handle database errors during verification', async () => {
      const mockToken = {
        token: 'valid-token',
        identifier: 'test@example.com',
      };

      mockedDb.query.verificationTokens.findFirst.mockResolvedValue(mockToken);
      mockedDb.update.mockRejectedValue(new Error('Database error'));

      await expect(verifyEmail('valid-token')).rejects.toThrow('Database error');
    });
  });
});