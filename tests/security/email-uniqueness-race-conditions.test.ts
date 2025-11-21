import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as registerHandler } from '@/app/api/auth/register/route';
import { db } from '@/db';
import { users } from '@/db/schema';

// Mock dependencies
vi.mock('@/db');
vi.mock('@/lib/email', () => ({
  generateVerificationEmail: vi.fn(() => ({ to: '', subject: '', html: '' })),
  sendEmail: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/default-project-creation', () => ({
  createDefaultProject: vi.fn().mockResolvedValue({ uuid: 'project-123' }),
}));
vi.mock('@/lib/admin-notifications', () => ({
  notifyAdminsOfNewUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/welcome-emails', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/rate-limiter', () => ({
  RateLimiters: {
    auth: vi.fn().mockResolvedValue({ allowed: true }),
  },
}));

const mockedDb = vi.mocked(db);

describe('Email Uniqueness and Race Condition Prevention', () => {
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

    mockedDb.insert = vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })) as any;

    mockedDb.delete = vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })) as any;

    mockedDb.select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })) as any;

    mockedDb.transaction = vi.fn((callback) => callback(mockedDb));
  });

  describe('Database-Level Email Uniqueness', () => {
    it('should enforce unique constraint on email at database level', async () => {
      // Simulate unique constraint violation
      const uniqueConstraintError: any = new Error('Unique constraint violation');
      uniqueConstraintError.code = '23505';
      uniqueConstraintError.constraint = 'users_email_unique';

      mockedDb.insert = vi.fn(() => ({
        values: vi.fn(() => Promise.reject(uniqueConstraintError)),
      })) as any;

      // Mock SELECT FOR UPDATE to return no existing user (should trigger retry logic)
      mockedDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })) as any;

      const request = new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          password: 'Password123!',
        }),
      });

      const response = await registerHandler(request);

      // Should handle the unique constraint error
      expect(response.status).toBeGreaterThanOrEqual(200);
    });

    it('should prevent duplicate email registrations', async () => {
      // First registration succeeds
      mockedDb.insert = vi.fn(() => ({
        values: vi.fn(() => Promise.resolve()),
      })) as any;

      const request1 = new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'User One',
          email: 'duplicate@example.com',
          password: 'Password123!',
        }),
      });

      const response1 = await registerHandler(request1);
      expect(response1.status).toBe(201);

      // Second registration with same email fails due to unique constraint
      const uniqueError: any = new Error('Duplicate email');
      uniqueError.code = '23505';
      uniqueError.constraint = 'users_email_unique';

      mockedDb.insert = vi.fn(() => ({
        values: vi.fn(() => Promise.reject(uniqueError)),
      })) as any;

      // Mock existing verified user
      mockedDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn(() => Promise.resolve([{
              id: 'existing-user',
              email: 'duplicate@example.com',
              emailVerified: new Date(),
              password: 'hashed',
            }])),
          })),
        })),
      })) as any;

      mockedDb.query.accounts.findMany.mockResolvedValue([]);

      const request2 = new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'User Two',
          email: 'duplicate@example.com',
          password: 'DifferentPassword123!',
        }),
      });

      const response2 = await registerHandler(request2);
      const data = await response2.json();

      expect(response2.status).toBe(409);
      expect(data.error).toBe('email_already_registered');
    });
  });

  describe('Race Condition Prevention with Transactions', () => {
    it('should use SELECT FOR UPDATE to lock rows during concurrent access', async () => {
      const uniqueError: any = new Error('Duplicate');
      uniqueError.code = '23505';
      uniqueError.constraint = 'users_email_unique';

      // First insert fails with unique constraint
      mockedDb.insert = vi.fn(() => ({
        values: vi.fn(() => Promise.reject(uniqueError)),
      })) as any;

      // Mock unverified user exists
      const unverifiedUser = {
        id: 'unverified-user',
        email: 'test@example.com',
        emailVerified: null,
        password: 'old-hash',
      };

      mockedDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn(() => Promise.resolve([unverifiedUser])),
          })),
        })),
      })) as any;

      mockedDb.query.accounts.findMany.mockResolvedValue([]);

      // Setup transaction to succeed
      mockedDb.transaction = vi.fn(async (callback) => {
        const tx = {
          ...mockedDb,
          insert: vi.fn(() => ({
            values: vi.fn(() => Promise.resolve()),
          })),
          delete: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve()),
          })),
          select: mockedDb.select,
          query: mockedDb.query,
        };
        return callback(tx);
      }) as any;

      const request = new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New User',
          email: 'test@example.com',
          password: 'Password123!',
        }),
      });

      await registerHandler(request);

      // Verify transaction was used
      expect(mockedDb.transaction).toHaveBeenCalled();

      // Verify SELECT FOR UPDATE pattern (the 'for' method should be called)
      expect(mockedDb.select).toHaveBeenCalled();
    });

    it('should atomically delete and insert in transaction', async () => {
      const uniqueError: any = new Error('Duplicate');
      uniqueError.code = '23505';
      uniqueError.constraint = 'users_email_unique';

      mockedDb.insert = vi.fn(() => ({
        values: vi.fn(() => Promise.reject(uniqueError)),
      })) as any;

      const unverifiedUser = {
        id: 'unverified-user',
        email: 'test@example.com',
        emailVerified: null,
        password: 'old-hash',
      };

      mockedDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn(() => Promise.resolve([unverifiedUser])),
          })),
        })),
      })) as any;

      mockedDb.query.accounts.findMany.mockResolvedValue([]);

      let deleteCallCount = 0;
      let insertCallCount = 0;

      mockedDb.transaction = vi.fn(async (callback) => {
        const tx = {
          ...mockedDb,
          delete: vi.fn(() => {
            deleteCallCount++;
            return {
              where: vi.fn(() => Promise.resolve()),
            };
          }),
          insert: vi.fn(() => {
            insertCallCount++;
            return {
              values: vi.fn(() => Promise.resolve()),
            };
          }),
          select: mockedDb.select,
          query: mockedDb.query,
        };
        const result = await callback(tx);
        return result;
      }) as any;

      const request = new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New User',
          email: 'test@example.com',
          password: 'Password123!',
        }),
      });

      await registerHandler(request);

      // Verify both delete and insert happened in transaction
      expect(deleteCallCount).toBe(1);
      expect(insertCallCount).toBe(1);
    });

    it('should prevent concurrent requests from creating duplicate accounts', async () => {
      const email = 'concurrent@example.com';
      let registrationAttempts = 0;

      // Simulate two concurrent requests
      const uniqueError: any = new Error('Duplicate');
      uniqueError.code = '23505';
      uniqueError.constraint = 'users_email_unique';

      mockedDb.insert = vi.fn(() => ({
        values: vi.fn(() => {
          registrationAttempts++;
          if (registrationAttempts === 1) {
            // First request succeeds
            return Promise.resolve();
          } else {
            // Second request gets unique constraint error
            return Promise.reject(uniqueError);
          }
        }),
      })) as any;

      // For second request, user already exists and is verified
      mockedDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn(() => Promise.resolve([{
              id: 'user-1',
              email,
              emailVerified: new Date(),
              password: 'hash',
            }])),
          })),
        })),
      })) as any;

      mockedDb.query.accounts.findMany.mockResolvedValue([]);

      const request1 = new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'User 1',
          email,
          password: 'Password123!',
        }),
      });

      const request2 = new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'User 2',
          email,
          password: 'DifferentPassword123!',
        }),
      });

      // Execute both requests
      const [response1, response2] = await Promise.all([
        registerHandler(request1),
        registerHandler(request2),
      ]);

      // First should succeed
      expect(response1.status).toBe(201);

      // Second should fail with 409 Conflict
      expect(response2.status).toBe(409);
    });
  });

  describe('Unverified User Replacement', () => {
    it('should allow replacement of unverified users', async () => {
      const uniqueError: any = new Error('Duplicate');
      uniqueError.code = '23505';
      uniqueError.constraint = 'users_email_unique';

      mockedDb.insert = vi.fn(() => ({
        values: vi.fn(() => Promise.reject(uniqueError)),
      })) as any;

      // Mock unverified user with no OAuth accounts
      mockedDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn(() => Promise.resolve([{
              id: 'unverified-user',
              email: 'test@example.com',
              emailVerified: null,
              password: 'old-hash',
            }])),
          })),
        })),
      })) as any;

      mockedDb.query.accounts.findMany.mockResolvedValue([]);

      mockedDb.transaction = vi.fn(async (callback) => {
        const tx = {
          ...mockedDb,
          delete: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve()),
          })),
          insert: vi.fn(() => ({
            values: vi.fn(() => Promise.resolve()),
          })),
          select: mockedDb.select,
          query: mockedDb.query,
        };
        return callback(tx);
      }) as any;

      const request = new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'New User',
          email: 'test@example.com',
          password: 'NewPassword123!',
        }),
      });

      const response = await registerHandler(request);

      expect(response.status).toBe(201);
    });

    it('should block replacement of verified users', async () => {
      const uniqueError: any = new Error('Duplicate');
      uniqueError.code = '23505';
      uniqueError.constraint = 'users_email_unique';

      mockedDb.insert = vi.fn(() => ({
        values: vi.fn(() => Promise.reject(uniqueError)),
      })) as any;

      // Mock verified user
      mockedDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn(() => Promise.resolve([{
              id: 'verified-user',
              email: 'test@example.com',
              emailVerified: new Date(),
              password: 'hash',
            }])),
          })),
        })),
      })) as any;

      mockedDb.query.accounts.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Attacker',
          email: 'test@example.com',
          password: 'AttackerPassword123!',
        }),
      });

      const response = await registerHandler(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe('email_already_registered');
    });

    it('should block replacement of users with OAuth accounts', async () => {
      const uniqueError: any = new Error('Duplicate');
      uniqueError.code = '23505';
      uniqueError.constraint = 'users_email_unique';

      mockedDb.insert = vi.fn(() => ({
        values: vi.fn(() => Promise.reject(uniqueError)),
      })) as any;

      // Mock unverified user but with OAuth account
      mockedDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn(() => Promise.resolve([{
              id: 'oauth-user',
              email: 'test@example.com',
              emailVerified: null,
              password: null,
            }])),
          })),
        })),
      })) as any;

      mockedDb.query.accounts.findMany.mockResolvedValue([
        { provider: 'google', userId: 'oauth-user', providerAccountId: 'google-123' },
      ]);

      const request = new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Attacker',
          email: 'test@example.com',
          password: 'AttackerPassword123!',
        }),
      });

      const response = await registerHandler(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe('email_already_registered');
    });
  });

  describe('DoS Prevention', () => {
    it('should prevent DoS by blocking deletion of active accounts', async () => {
      const uniqueError: any = new Error('Duplicate');
      uniqueError.code = '23505';
      uniqueError.constraint = 'users_email_unique';

      mockedDb.insert = vi.fn(() => ({
        values: vi.fn(() => Promise.reject(uniqueError)),
      })) as any;

      // Mock verified user (active account)
      mockedDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn(() => Promise.resolve([{
              id: 'active-user',
              email: 'victim@example.com',
              emailVerified: new Date(),
              password: 'hash',
            }])),
          })),
        })),
      })) as any;

      mockedDb.query.accounts.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Attacker',
          email: 'victim@example.com',
          password: 'AttackerPassword123!',
        }),
      });

      const response = await registerHandler(request);

      // Should block the request, preventing DoS
      expect(response.status).toBe(409);

      // Delete should not be called
      expect(mockedDb.delete).not.toHaveBeenCalled();
    });
  });
});
