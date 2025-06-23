import { describe, it, expect, beforeEach, vi } from 'vitest';

import { db } from '@/db';
import { accounts } from '@/db/schema';
import { authOptions } from '@/lib/auth';
import { createMockUser, createMockDb } from '../utils/mocks';

// Mock the DB client
vi.mock('@/db');

// Mock bcrypt
vi.mock('bcrypt', () => ({
  compare: vi.fn(),
}));

const mockedDb = vi.mocked(db);

describe('OAuth Account Linking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    mockedDb.query = {
      users: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      accounts: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    } as any;
    
    mockedDb.insert = vi.fn(() => ({ 
      values: vi.fn(() => Promise.resolve()) 
    })) as any;
  });

  describe('signIn callback behavior', () => {
    it('should return true for credential login', async () => {
      // Get the signIn callback from auth options
      const signInCallback = authOptions.callbacks?.signIn;
      expect(signInCallback).toBeDefined();
      
      if (!signInCallback) return; // TypeScript guard
      
      const result = await signInCallback({
        user: { id: '123', email: 'test@example.com' },
        account: { 
          provider: 'credentials',
          type: 'credentials',
          providerAccountId: '123'
        },
        profile: {},
        credentials: {},
        isNewUser: false,
      });
      
      expect(result).toBe(true);
    });
    
    it('should return false for OAuth login without email', async () => {
      const signInCallback = authOptions.callbacks?.signIn;
      if (!signInCallback) return;
      
      const result = await signInCallback({
        user: { id: '123' },
        account: { 
          provider: 'github',
          type: 'oauth',
          providerAccountId: 'gh-123'
        },
        profile: {},
        credentials: {},
        isNewUser: false,
      });
      
      expect(result).toBe(false);
    });
    
    it('should use existing account for OAuth login with matching email', async () => {
      const signInCallback = authOptions.callbacks?.signIn;
      if (!signInCallback) return;
      
      const mockUser = createMockUser({ id: 'db-123', email: 'test@example.com', emailVerified: new Date() });
      
      // Mock DB queries
      mockedDb.query.users.findFirst.mockResolvedValue(mockUser);
      mockedDb.query.accounts.findFirst.mockResolvedValue(null);
      
      const user = { id: 'oauth-456', email: 'test@example.com' };
      const account = { 
        provider: 'github',
        type: 'oauth',
        providerAccountId: 'gh-123'
      };
      
      const result = await signInCallback({
        user,
        account,
        profile: {},
        credentials: {},
        isNewUser: false,
      });
      
      expect(result).toBe(true);
      expect(user.id).toBe(mockUser.id);
      expect(mockedDb.insert).toHaveBeenCalledWith(accounts);
    });
    
    it('should not create a duplicate account link if one already exists', async () => {
      const signInCallback = authOptions.callbacks?.signIn;
      if (!signInCallback) return;
      
      const mockUser = { id: 'db-123', email: 'test@example.com', emailVerified: new Date() };
      
      // Mock existing account link
      mockedDb.query.users.findFirst.mockResolvedValue(mockUser);
      mockedDb.query.accounts.findFirst.mockResolvedValue({
        userId: mockUser.id,
        provider: 'github',
      });
      
      const user = { id: 'oauth-456', email: 'test@example.com' };
      const account = { 
        provider: 'github',
        type: 'oauth',
        providerAccountId: 'gh-123'
      };
      
      const result = await signInCallback({
        user,
        account,
        profile: {},
        credentials: {},
        isNewUser: false,
      });
      
      expect(result).toBe(true);
      expect(user.id).toBe(mockUser.id);
      expect(mockedDb.insert).not.toHaveBeenCalled();
    });
    
    it('should handle different OAuth providers for the same user', async () => {
      const signInCallback = authOptions.callbacks?.signIn;
      if (!signInCallback) return;
      
      const mockUser = { id: 'db-123', email: 'test@example.com', emailVerified: new Date() };
      
      // User exists but no Google account linked yet
      mockedDb.query.users.findFirst.mockResolvedValue(mockUser);
      mockedDb.query.accounts.findFirst.mockResolvedValue(null);
      
      const user = { id: 'oauth-456', email: 'test@example.com' };
      const account = { 
        provider: 'google',
        type: 'oauth',
        providerAccountId: 'gl-123'
      };
      
      const result = await signInCallback({
        user,
        account,
        profile: {},
        credentials: {},
        isNewUser: false,
      });
      
      expect(result).toBe(true);
      expect(user.id).toBe(mockUser.id);
      expect(mockedDb.insert).toHaveBeenCalledWith(accounts);
    });
    
    it('should handle database errors gracefully', async () => {
      const signInCallback = authOptions.callbacks?.signIn;
      if (!signInCallback) return;
      
      // Force DB query to throw an error
      mockedDb.query.users.findFirst.mockRejectedValue(new Error('Database error'));
      
      const result = await signInCallback({
        user: { id: '123', email: 'test@example.com' },
        account: { provider: 'github' },
        profile: {},
        credentials: {},
        isNewUser: false,
      });
      
      expect(result).toBe(false);
    });
  });
  
  describe('Integration with other callbacks', () => {
    it('should properly pass user ID from signIn to jwt callback', async () => {
      const signInCallback = authOptions.callbacks?.signIn;
      const jwtCallback = authOptions.callbacks?.jwt;
      
      if (!signInCallback || !jwtCallback) return;
      
      const mockUser = { id: 'db-123', email: 'test@example.com', name: 'Test User', emailVerified: new Date() };
      mockedDb.query.users.findFirst.mockResolvedValue(mockUser);
      mockedDb.query.accounts.findFirst.mockResolvedValue(null);
      
      const user = { id: 'oauth-456', email: 'test@example.com', name: 'OAuth User' };
      const account = { 
        provider: 'github',
        type: 'oauth',
        providerAccountId: 'gh-123'
      };
      
      // First simulate sign in
      await signInCallback({
        user,
        account,
        profile: {},
        credentials: {},
        isNewUser: false,
      });
      
      // Now test JWT callback with the updated user
      const token = { name: '', email: '', id: '', sub: '' };
      const jwtResult = await jwtCallback({
        token,
        user,
        account,
        profile: undefined,
        isNewUser: false,
      });
      
      expect(jwtResult.id).toBe(mockUser.id);
      expect(jwtResult.name).toBe(user.name);
      expect(jwtResult.email).toBe(user.email);
    });
    
    it('should properly pass user info from jwt to session callback', async () => {
      const sessionCallback = authOptions.callbacks?.session;
      if (!sessionCallback) return;
      
      const token = { 
        id: 'db-123', 
        name: 'Test User', 
        email: 'test@example.com',
        picture: 'https://example.com/pic.jpg',
        sub: 'sub-123'
      };
      
      const session = { 
        user: { 
          id: '', 
          name: '', 
          email: '',
          image: undefined
        },
        expires: ''
      };
      
      const sessionResult = await sessionCallback({
        session,
        token,
        user: undefined,
        newSession: false,
        trigger: 'update'
      });
      
      expect(sessionResult.user.id).toBe(token.id);
      expect(sessionResult.user.name).toBe(token.name);
      expect(sessionResult.user.email).toBe(token.email);
      expect(sessionResult.user.image).toBe(token.picture);
    });
  });
}); 