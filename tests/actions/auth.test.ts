import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcrypt';

import { registerUser, loginUser } from '@/app/actions/auth';
import { db } from '@/db';
import { users } from '@/db/schema';
import { createMockUser } from '../utils/mocks';

// Mock dependencies
vi.mock('@/db');
vi.mock('bcrypt');
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(),
}));

const mockedDb = vi.mocked(db);
const mockedBcrypt = vi.mocked(bcrypt);

describe('Authentication Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    mockedDb.select = vi.fn().mockReturnThis();
    mockedDb.insert = vi.fn().mockReturnThis();
    mockedDb.from = vi.fn().mockReturnThis();
    mockedDb.where = vi.fn().mockReturnThis();
    mockedDb.values = vi.fn().mockReturnThis();
    mockedDb.returning = vi.fn();
  });

  describe('registerUser', () => {
    it('should successfully register a new user', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
      };

      // Mock that user doesn't exist
      mockedDb.returning.mockResolvedValueOnce([]);
      
      // Mock successful user creation
      const newUser = createMockUser({
        id: 'new-user-id',
        ...userData,
        password: undefined, // password should not be returned
      });
      mockedDb.returning.mockResolvedValueOnce([newUser]);

      // Mock bcrypt hash
      mockedBcrypt.hash.mockResolvedValue('hashed-password' as never);

      const result = await registerUser(userData);

      expect(result.success).toBe(true);
      expect(result.user).toEqual(newUser);
      expect(mockedBcrypt.hash).toHaveBeenCalledWith('password123', 12);
    });

    it('should fail if user already exists', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
      };

      // Mock that user already exists
      const existingUser = createMockUser({ email: userData.email });
      mockedDb.returning.mockResolvedValueOnce([existingUser]);

      const result = await registerUser(userData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('User already exists');
    });

    it('should handle database errors', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
      };

      // Mock database error
      mockedDb.returning.mockRejectedValueOnce(new Error('Database error'));

      const result = await registerUser(userData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
    });

    it('should validate required fields', async () => {
      const incompleteData = {
        name: 'Test User',
        // Missing email, password, username
      } as any;

      const result = await registerUser(incompleteData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });
  });

  describe('loginUser', () => {
    it('should successfully login with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const user = createMockUser({
        email: loginData.email,
        password: 'hashed-password',
      });

      // Mock user found
      mockedDb.returning.mockResolvedValueOnce([user]);
      
      // Mock bcrypt compare success
      mockedBcrypt.compare.mockResolvedValue(true as never);

      const result = await loginUser(loginData);

      expect(result.success).toBe(true);
      expect(result.user).toEqual(user);
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(
        'password123',
        'hashed-password'
      );
    });

    it('should fail with invalid email', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      // Mock user not found
      mockedDb.returning.mockResolvedValueOnce([]);

      const result = await loginUser(loginData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid credentials');
    });

    it('should fail with invalid password', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      const user = createMockUser({
        email: loginData.email,
        password: 'hashed-password',
      });

      // Mock user found
      mockedDb.returning.mockResolvedValueOnce([user]);
      
      // Mock bcrypt compare failure
      mockedBcrypt.compare.mockResolvedValue(false as never);

      const result = await loginUser(loginData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid credentials');
    });

    it('should handle database errors during login', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      // Mock database error
      mockedDb.returning.mockRejectedValueOnce(new Error('Database connection failed'));

      const result = await loginUser(loginData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
    });
  });
});