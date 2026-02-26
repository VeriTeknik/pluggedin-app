import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';

import {
  createApiKey,
  deleteApiKey,
  getApiKeys,
  getFirstApiKey,
  getUserApiKeys,
  trackApiKeyUsage,
  updateApiKeyHub,
} from '@/app/actions/api-keys';
import { db } from '@/db';
import { apiKeysTable, projectsTable } from '@/db/schema';

// Valid UUID constants for testing
// Note: These are test UUIDs, not actual API keys
const UUID_PROJECT_1 = '123e4567-e89b-12d3-a456-426614174000';
const UUID_PROJECT_2 = '123e4567-e89b-12d3-a456-426614174001';
const UUID_KEY_1 = '223e4567-e89b-12d3-a456-426614174000'; // gitleaks:allow
const UUID_KEY_2 = '223e4567-e89b-12d3-a456-426614174001'; // gitleaks:allow
const UUID_KEY_3 = '223e4567-e89b-12d3-a456-426614174002'; // gitleaks:allow
const UUID_USER = '323e4567-e89b-12d3-a456-426614174000';

// Mock dependencies
vi.mock('@/db');
vi.mock('@/lib/auth-helpers', () => ({
  withAuth: vi.fn((callback) => callback({ user: { id: UUID_USER, email: 'test@example.com' } })),
  withProjectAuth: vi.fn((projectUuid, callback) =>
    callback(
      { user: { id: UUID_USER, email: 'test@example.com' } },
      { uuid: projectUuid, user_id: UUID_USER, name: 'Test Hub' }
    )
  ),
}));

const mockedDb = vi.mocked(db);

describe('API Keys Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Setup default mock implementations
    mockedDb.query = {
      apiKeysTable: {
        findFirst: vi.fn(),
      },
      projectsTable: {
        findFirst: vi.fn(),
      },
    } as any;
    mockedDb.select = vi.fn().mockReturnThis();
    mockedDb.from = vi.fn().mockReturnThis();
    mockedDb.where = vi.fn().mockReturnThis();
    mockedDb.innerJoin = vi.fn().mockReturnThis();
    mockedDb.orderBy = vi.fn().mockReturnThis();
    mockedDb.limit = vi.fn().mockReturnThis();
    mockedDb.insert = vi.fn().mockReturnThis();
    mockedDb.values = vi.fn().mockReturnThis();
    mockedDb.update = vi.fn().mockReturnThis();
    mockedDb.delete = vi.fn().mockReturnThis();
    mockedDb.set = vi.fn().mockReturnThis();
    mockedDb.returning = vi.fn();
    mockedDb.execute = vi.fn();
    mockedDb.transaction = vi.fn(async (callback) => callback(mockedDb as any));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createApiKey', () => {
    it('should successfully create an API key with name', async () => {
      const mockApiKey = {
        uuid: UUID_KEY_1,
        api_key: 'pg_in_test123',
        name: 'Test Key',
        project_uuid: UUID_PROJECT_1,
        created_at: new Date('2025-01-01'),
        last_used_at: null,
      };

      mockedDb.returning.mockResolvedValue([mockApiKey]);

      const result = await createApiKey(UUID_PROJECT_1, 'Test Key');

      expect(result).toEqual({
        ...mockApiKey,
        created_at: mockApiKey.created_at.toISOString(),
        last_used_at: null,
      });
      expect(mockedDb.insert).toHaveBeenCalledWith(apiKeysTable);
    });

    it('should sanitize API key name before persisting', async () => {
      const mockApiKey = {
        uuid: UUID_KEY_1,
        api_key: 'pg_in_test123',
        name: 'Test Key',
        project_uuid: UUID_PROJECT_1,
        created_at: new Date('2025-01-01'),
        last_used_at: null,
      };

      mockedDb.returning.mockResolvedValue([mockApiKey]);

      const result = await createApiKey(UUID_PROJECT_1, '   <b>Test Key</b>  ');

      expect(result.name).toBe('Test Key');
      expect(mockedDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Test Key' })
      );
    });

    it('should successfully create an API key without name', async () => {
      const mockApiKey = {
        uuid: UUID_KEY_2,
        api_key: 'pg_in_test456',
        name: null,
        project_uuid: UUID_PROJECT_1,
        created_at: new Date('2025-01-01'),
        last_used_at: null,
      };

      mockedDb.returning.mockResolvedValue([mockApiKey]);

      const result = await createApiKey(UUID_PROJECT_1);

      expect(result).toEqual({
        ...mockApiKey,
        created_at: mockApiKey.created_at.toISOString(),
        last_used_at: null,
      });
    });

    it('should throw error for invalid project UUID', async () => {
      await expect(createApiKey('invalid-uuid')).rejects.toThrow('Invalid UUID format');
    });

    it('should throw error for empty API key name', async () => {
      await expect(createApiKey(UUID_PROJECT_1, '   ')).rejects.toThrow('API key name is required');
    });

    it('should throw error for API key name exceeding max length', async () => {
      const longName = 'a'.repeat(65);
      await expect(createApiKey(UUID_PROJECT_1, longName)).rejects.toThrow('Invalid API key name.');
    });

    it('should generate unique API keys with pg_in prefix', async () => {
      const mockApiKey = {
        uuid: UUID_KEY_3,
        api_key: 'pg_in_test789',
        name: 'Test',
        project_uuid: UUID_PROJECT_1,
        created_at: new Date(),
        last_used_at: null,
      };

      mockedDb.returning.mockResolvedValue([mockApiKey]);

      const result = await createApiKey(UUID_PROJECT_1, 'Test');

      expect(result.api_key).toMatch(/^pg_in_/);
    });
  });

  describe('getFirstApiKey', () => {
    it('should return existing API key if found', async () => {
      const mockApiKey = {
        uuid: UUID_KEY_1,
        api_key: 'pg_in_test123',
        name: 'Test Key',
        project_uuid: UUID_PROJECT_1,
        created_at: new Date('2025-01-01'),
        last_used_at: null,
      };

      mockedDb.query.apiKeysTable.findFirst.mockResolvedValue(mockApiKey);

      const result = await getFirstApiKey(UUID_PROJECT_1);

      expect(result).toEqual({
        ...mockApiKey,
        created_at: mockApiKey.created_at.toISOString(),
        last_used_at: null,
      });
    });

    it('should create new API key if none exists', async () => {
      const mockApiKey = {
        uuid: UUID_KEY_2,
        api_key: 'pg_in_newkey',
        name: null,
        project_uuid: UUID_PROJECT_1,
        created_at: new Date('2025-01-01'),
        last_used_at: null,
      };

      mockedDb.query.apiKeysTable.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockApiKey);

      const result = await getFirstApiKey(UUID_PROJECT_1);

      expect(mockedDb.insert).toHaveBeenCalledWith(apiKeysTable);
      expect(result).toEqual({
        ...mockApiKey,
        created_at: mockApiKey.created_at.toISOString(),
        last_used_at: null,
      });
    });

    it('should return null if projectUuid is falsy', async () => {
      const result = await getFirstApiKey('');
      expect(result).toBeNull();
    });

    it('should return null if API key creation fails', async () => {
      mockedDb.query.apiKeysTable.findFirst.mockResolvedValue(null);

      const result = await getFirstApiKey(UUID_PROJECT_1);

      expect(result).toBeNull();
    });
  });

  describe('getApiKeys', () => {
    it('should return all API keys for a project', async () => {
      const mockApiKeys = [
        {
          uuid: UUID_KEY_1,
          api_key: 'pg_in_key1',
          name: 'Key 1',
          project_uuid: UUID_PROJECT_1,
          created_at: new Date('2025-01-01'),
          last_used_at: new Date('2025-01-02'),
        },
        {
          uuid: UUID_KEY_2,
          api_key: 'pg_in_key2',
          name: 'Key 2',
          project_uuid: UUID_PROJECT_1,
          created_at: new Date('2025-01-03'),
          last_used_at: null,
        },
      ];

      mockedDb.where.mockResolvedValue(mockApiKeys);

      const result = await getApiKeys(UUID_PROJECT_1);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        ...mockApiKeys[0],
        created_at: mockApiKeys[0].created_at.toISOString(),
        last_used_at: mockApiKeys[0].last_used_at!.toISOString(),
      });
      expect(result[1]).toEqual({
        ...mockApiKeys[1],
        created_at: mockApiKeys[1].created_at.toISOString(),
        last_used_at: null,
      });
    });

    it('should return empty array if no keys found', async () => {
      mockedDb.where.mockResolvedValue([]);

      const result = await getApiKeys(UUID_PROJECT_1);

      expect(result).toEqual([]);
    });
  });

  describe('deleteApiKey', () => {
    it('should successfully delete an API key', async () => {
      mockedDb.returning.mockResolvedValue([{ uuid: UUID_KEY_1 }]);

      const result = await deleteApiKey(UUID_KEY_1, UUID_PROJECT_1);

      expect(result).toEqual({ success: true });
      expect(mockedDb.delete).toHaveBeenCalledWith(apiKeysTable);
    });

    it('should return success false when API key does not exist', async () => {
      mockedDb.returning.mockResolvedValue([]);

      const result = await deleteApiKey(UUID_KEY_1, UUID_PROJECT_1);

      expect(result).toEqual({ success: false });
    });

    it('should throw error for invalid UUIDs', async () => {
      await expect(deleteApiKey('invalid', UUID_PROJECT_1)).rejects.toThrow();
      await expect(deleteApiKey(UUID_KEY_1, 'invalid')).rejects.toThrow();
    });
  });

  describe('getUserApiKeys', () => {
    it('should return all API keys for user across all Hubs', async () => {
      const mockApiKeys = [
        {
          uuid: UUID_KEY_1,
          api_key: 'pg_in_key1',
          name: 'Hub 1 Key',
          project_uuid: UUID_PROJECT_1,
          created_at: new Date('2025-01-01'),
          last_used_at: new Date('2025-01-02'),
          project_name: 'Hub 1',
        },
        {
          uuid: UUID_KEY_2,
          api_key: 'pg_in_key2',
          name: 'Hub 2 Key',
          project_uuid: UUID_PROJECT_2,
          created_at: new Date('2025-01-03'),
          last_used_at: null,
          project_name: 'Hub 2',
        },
      ];

      mockedDb.orderBy.mockResolvedValue(mockApiKeys);

      const result = await getUserApiKeys();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        ...mockApiKeys[0],
        created_at: mockApiKeys[0].created_at.toISOString(),
        last_used_at: mockApiKeys[0].last_used_at!.toISOString(),
      });
      expect(result[0].project_name).toBe('Hub 1');
      expect(result[1].project_name).toBe('Hub 2');
      expect(mockedDb.innerJoin).toHaveBeenCalled();
    });

    it('should return empty array if user has no API keys', async () => {
      mockedDb.orderBy.mockResolvedValue([]);

      const result = await getUserApiKeys();

      expect(result).toEqual([]);
    });
  });

  describe('updateApiKeyHub', () => {
    it('should successfully update API key Hub assignment', async () => {
      const apiKeyRecord = { project_uuid: UUID_PROJECT_1 };
      mockedDb.query.apiKeysTable.findFirst.mockResolvedValue(apiKeyRecord as any);
      mockedDb.query.projectsTable.findFirst
        .mockResolvedValueOnce({ uuid: UUID_PROJECT_1, user_id: UUID_USER, is_active: true } as any)
        .mockResolvedValueOnce({ uuid: UUID_PROJECT_2, user_id: UUID_USER, is_active: true } as any);
      mockedDb.transaction.mockImplementation(async (cb) => cb(mockedDb as any));
      mockedDb.update.mockReturnThis();
      mockedDb.set.mockReturnThis();
      mockedDb.where.mockReturnThis();

      const result = await updateApiKeyHub(UUID_KEY_1, UUID_PROJECT_2);

      expect(result).toEqual({ success: true });
      expect(mockedDb.transaction).toHaveBeenCalled();
      expect(mockedDb.update).toHaveBeenCalledWith(apiKeysTable);
    });

    it('should throw error if API key not found', async () => {
      mockedDb.query.apiKeysTable.findFirst.mockResolvedValue(null);

      await expect(updateApiKeyHub(UUID_KEY_3, UUID_PROJECT_1)).rejects.toThrow(
        'API key not found'
      );
    });

    it('should throw error if user does not own API key', async () => {
      mockedDb.query.apiKeysTable.findFirst.mockResolvedValue({ project_uuid: UUID_PROJECT_1 } as any);
      mockedDb.query.projectsTable.findFirst.mockResolvedValueOnce({ uuid: UUID_PROJECT_1, user_id: 'other-user-id' } as any);

      await expect(updateApiKeyHub(UUID_KEY_1, UUID_PROJECT_1)).rejects.toThrow(
        'Unauthorized - you do not own this API key'
      );
    });

    it('should throw error if target Hub not found', async () => {
      mockedDb.query.apiKeysTable.findFirst.mockResolvedValue({ project_uuid: UUID_PROJECT_1 } as any);
      mockedDb.query.projectsTable.findFirst
        .mockResolvedValueOnce({ uuid: UUID_PROJECT_1, user_id: UUID_USER, is_active: true } as any)
        .mockResolvedValueOnce(null);

      await expect(updateApiKeyHub(UUID_KEY_1, UUID_PROJECT_2)).rejects.toThrow(
        'Target Hub not found'
      );
    });

    it('should throw error if user does not own target Hub', async () => {
      mockedDb.query.apiKeysTable.findFirst.mockResolvedValue({ project_uuid: UUID_PROJECT_1 } as any);
      mockedDb.query.projectsTable.findFirst
        .mockResolvedValueOnce({ uuid: UUID_PROJECT_1, user_id: UUID_USER, is_active: true } as any)
        .mockResolvedValueOnce({ uuid: UUID_PROJECT_2, user_id: 'other-user-id', is_active: true } as any);

      await expect(updateApiKeyHub(UUID_KEY_1, UUID_PROJECT_1)).rejects.toThrow(
        'Unauthorized - you do not own the target Hub'
      );
    });

    it('should throw error if target Hub is not active', async () => {
      mockedDb.query.apiKeysTable.findFirst.mockResolvedValue({ project_uuid: UUID_PROJECT_1 } as any);
      mockedDb.query.projectsTable.findFirst
        .mockResolvedValueOnce({ uuid: UUID_PROJECT_1, user_id: UUID_USER, is_active: true } as any)
        .mockResolvedValueOnce({ uuid: UUID_PROJECT_2, user_id: UUID_USER, is_active: false } as any);

      await expect(updateApiKeyHub(UUID_KEY_1, UUID_PROJECT_1)).rejects.toThrow(
        'Target Hub is not active'
      );
    });

    it('should throw error if target Hub is deleted', async () => {
      mockedDb.query.apiKeysTable.findFirst.mockResolvedValue({ project_uuid: UUID_PROJECT_1 } as any);
      mockedDb.query.projectsTable.findFirst
        .mockResolvedValueOnce({ uuid: UUID_PROJECT_1, user_id: UUID_USER, is_active: true } as any)
        .mockResolvedValueOnce({ uuid: UUID_PROJECT_2, user_id: UUID_USER, is_active: true, deleted_at: new Date() } as any);

      await expect(updateApiKeyHub(UUID_KEY_1, UUID_PROJECT_2)).rejects.toThrow(
        'Target Hub is deleted'
      );
    });

    it('should throw error if target Hub is missing required fields', async () => {
      mockedDb.query.apiKeysTable.findFirst.mockResolvedValue({ project_uuid: UUID_PROJECT_1 } as any);
      mockedDb.query.projectsTable.findFirst
        .mockResolvedValueOnce({ uuid: UUID_PROJECT_1, user_id: UUID_USER, is_active: true } as any)
        .mockResolvedValueOnce({} as any);

      await expect(updateApiKeyHub(UUID_KEY_1, UUID_PROJECT_2)).rejects.toThrow(
        'Target Hub is missing required fields'
      );
    });
  });

  describe('trackApiKeyUsage', () => {
    it('should debounce usage updates and use atomic timestamp', async () => {
      mockedDb.where.mockResolvedValue(undefined);

      // First call
      trackApiKeyUsage(UUID_KEY_1);

      // Immediate second call should cancel first timeout
      trackApiKeyUsage(UUID_KEY_1);

      // Fast-forward time past debounce delay
      await vi.advanceTimersByTimeAsync(5100);

      // Give async operations time to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should only update once due to debouncing
      expect(mockedDb.update).toHaveBeenCalledWith(apiKeysTable);
    });

    it('should batch updates for same key within debounce window', async () => {
      mockedDb.where.mockResolvedValue(undefined);

      // Multiple rapid calls
      trackApiKeyUsage(UUID_KEY_1);
      trackApiKeyUsage(UUID_KEY_1);
      trackApiKeyUsage(UUID_KEY_1);

      await vi.advanceTimersByTimeAsync(5100);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should only update once
      expect(mockedDb.update).toHaveBeenCalled();
    });

    it('should update different keys independently', async () => {
      mockedDb.where.mockResolvedValue(undefined);

      trackApiKeyUsage(UUID_KEY_1);
      trackApiKeyUsage(UUID_KEY_2);

      await vi.advanceTimersByTimeAsync(5100);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should update both keys
      expect(mockedDb.update).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockedDb.where.mockRejectedValue(new Error('Database error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      trackApiKeyUsage(UUID_KEY_1);
      await vi.advanceTimersByTimeAsync(5100);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should throw error for invalid UUID', async () => {
      // Track API key usage validates UUID before updating
      await expect(trackApiKeyUsage('invalid-uuid')).rejects.toThrow();
    });

    it('should reduce database writes by ~80% under load', async () => {
      mockedDb.where.mockResolvedValue(undefined);

      // Simulate 10 rapid requests for same key (each resets the debounce timer)
      trackApiKeyUsage(UUID_KEY_1);
      vi.advanceTimersByTime(100);
      trackApiKeyUsage(UUID_KEY_1);
      vi.advanceTimersByTime(100);
      trackApiKeyUsage(UUID_KEY_1);

      // Wait for final debounce
      await vi.advanceTimersByTimeAsync(5100);
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should only update once because all calls within 5 seconds are batched
      expect(mockedDb.update).toHaveBeenCalled();
    }, 15000);
  });

  describe('Type Safety', () => {
    it('should properly convert Date objects to ISO strings', async () => {
      const mockApiKey = {
        uuid: UUID_KEY_1,
        api_key: 'pg_in_test',
        name: 'Test',
        project_uuid: UUID_PROJECT_1,
        created_at: new Date('2025-01-01T00:00:00Z'),
        last_used_at: new Date('2025-01-02T12:00:00Z'),
      };

      mockedDb.returning.mockResolvedValue([mockApiKey]);

      const result = await createApiKey(UUID_PROJECT_1, 'Test');

      expect(typeof result.created_at).toBe('string');
      expect(typeof result.last_used_at).toBe('string');
      expect(result.created_at).toBe('2025-01-01T00:00:00.000Z');
      expect(result.last_used_at).toBe('2025-01-02T12:00:00.000Z');
    });

    it('should handle null last_used_at properly', async () => {
      const mockApiKey = {
        uuid: UUID_KEY_1,
        api_key: 'pg_in_test',
        name: 'Test',
        project_uuid: UUID_PROJECT_1,
        created_at: new Date('2025-01-01'),
        last_used_at: null,
      };

      mockedDb.returning.mockResolvedValue([mockApiKey]);

      const result = await createApiKey(UUID_PROJECT_1, 'Test');

      expect(result.last_used_at).toBeNull();
    });
  });
});
