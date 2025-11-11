import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'crypto';
import { mockApiResponse, mockApiError, resetAllMocks } from '../test-utils';

/**
 * OAuth 2.1 Token Refresh Tests
 *
 * Tests token refresh operations including:
 * - Token expiration detection
 * - Refresh token exchange
 * - Token rotation (OAuth 2.1)
 * - Race condition prevention with optimistic locking
 * - Error recovery and lock cleanup
 */

// Mock dependencies
vi.mock('@/lib/observability/logger', () => ({
  log: {
    oauth: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/observability/oauth-metrics', () => ({
  recordTokenRefresh: vi.fn(),
  recordTokenReuseDetected: vi.fn(),
  recordTokenRevocation: vi.fn(),
}));

vi.mock('@/lib/encryption', () => ({
  encryptField: vi.fn((value) => `encrypted_${JSON.stringify(value)}`),
  decryptField: vi.fn((value) => {
    if (typeof value === 'string' && value.startsWith('encrypted_')) {
      return JSON.parse(value.substring(10));
    }
    return value;
  }),
}));

vi.mock('@/db', () => {
  const mockDb = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    limit: vi.fn().mockReturnThis(),
    query: {
      mcpServerOAuthTokensTable: {
        findFirst: vi.fn(),
      },
      mcpServersTable: {
        findFirst: vi.fn(),
      },
      profilesTable: {
        findFirst: vi.fn(),
      },
      projectsTable: {
        findFirst: vi.fn(),
      },
    },
  };
  return { db: mockDb };
});

describe('OAuth 2.1 Token Refresh', () => {
  const mockServerUuid = 'test-server-uuid';
  const mockUserId = 'test-user-id';
  const mockTokenEndpoint = 'https://auth.example.com/token';
  const mockClientId = 'test-client-id';

  beforeEach(() => {
    resetAllMocks();
    vi.clearAllTimers();
  });

  afterEach(() => {
    resetAllMocks();
  });

  // Helper to mock server ownership validation
  const mockServerOwnership = (db: any, userId: string = mockUserId) => {
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ profile_uuid: 'profile-uuid' }]),
        }),
      }),
    });

    (db.query.profilesTable.findFirst as any).mockResolvedValue({
      uuid: 'profile-uuid',
      project_uuid: 'project-uuid',
    });

    (db.query.projectsTable.findFirst as any).mockResolvedValue({
      uuid: 'project-uuid',
      user_id: userId,
    });
  };

  // Helper to mock OAuth config
  const mockOAuthConfig = async () => {
    vi.doMock('@/lib/oauth/oauth-config-store', () => ({
      getOAuthConfig: vi.fn().mockResolvedValue({
        serverUuid: mockServerUuid,
        client_id: mockClientId,
        token_endpoint: mockTokenEndpoint,
        client_secret_encrypted: null, // Public client
      }),
    }));
  };

  describe('Token Expiration Detection', () => {
    it('should detect expired tokens', async () => {
      const { isTokenExpired } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');

      // Token expired 1 hour ago
      (db.query.mcpServerOAuthTokensTable.findFirst as any).mockResolvedValue({
        uuid: 'token-uuid',
        server_uuid: mockServerUuid,
        access_token_encrypted: 'encrypted_token',
        expires_at: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      });

      const expired = await isTokenExpired(mockServerUuid);
      expect(expired).toBe(true);
    });

    it('should detect tokens expiring soon (within 5-minute buffer)', async () => {
      const { isTokenExpired } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');

      // Token expires in 3 minutes (within 5-minute buffer)
      (db.query.mcpServerOAuthTokensTable.findFirst as any).mockResolvedValue({
        uuid: 'token-uuid',
        server_uuid: mockServerUuid,
        access_token_encrypted: 'encrypted_token',
        expires_at: new Date(Date.now() + 3 * 60 * 1000), // 3 minutes from now
      });

      const expired = await isTokenExpired(mockServerUuid);
      expect(expired).toBe(true); // Should be true due to 5-minute buffer
    });

    it('should not flag valid tokens as expired', async () => {
      const { isTokenExpired } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');

      // Token expires in 30 minutes
      (db.query.mcpServerOAuthTokensTable.findFirst as any).mockResolvedValue({
        uuid: 'token-uuid',
        server_uuid: mockServerUuid,
        access_token_encrypted: 'encrypted_token',
        expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
      });

      const expired = await isTokenExpired(mockServerUuid);
      expect(expired).toBe(false);
    });

    it('should handle tokens without expiration (permanent tokens)', async () => {
      const { isTokenExpired } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');

      // Token without expiration
      (db.query.mcpServerOAuthTokensTable.findFirst as any).mockResolvedValue({
        uuid: 'token-uuid',
        server_uuid: mockServerUuid,
        access_token_encrypted: 'encrypted_token',
        expires_at: null, // No expiration
      });

      const expired = await isTokenExpired(mockServerUuid);
      expect(expired).toBe(false); // Permanent token, never expires
    });
  });

  describe('Token Refresh with Optimistic Locking (P0 Race Condition Fix)', () => {
    it('should atomically lock token before refresh', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');
      const { encryptField } = await import('@/lib/encryption');

      mockServerOwnership(db);
      await mockOAuthConfig();

      let lockAcquired = false;

      (db.update as any).mockImplementation(() => ({
        set: vi.fn().mockImplementation((values: any) => {
          if (values.refresh_token_locked_at) {
            lockAcquired = true;
          }
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{
                uuid: 'token-uuid',
                server_uuid: mockServerUuid,
                access_token_encrypted: encryptField('old_access_token'),
                refresh_token_encrypted: encryptField('old_refresh_token'),
                refresh_token_used_at: null,
                refresh_token_locked_at: lockAcquired ? new Date() : null,
                expires_at: new Date(Date.now() - 1000), // Expired
              }]),
            }),
          };
        }),
      }));

      global.fetch = vi.fn().mockResolvedValue(mockApiResponse({
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        token_type: 'Bearer',
        expires_in: 3600,
      }));

      (db.query.mcpServersTable.findFirst as any).mockResolvedValue({
        uuid: mockServerUuid,
        streamable_http_options_encrypted: encryptField({ headers: {} }),
      });

      await refreshOAuthToken(mockServerUuid, mockUserId);

      expect(lockAcquired).toBe(true);
    });

    it('should detect concurrent refresh and wait (lock age < 60s)', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');
      const { encryptField } = await import('@/lib/encryption');

      mockServerOwnership(db);

      // Token locked 10 seconds ago (active lock)
      const recentLock = new Date(Date.now() - 10 * 1000);

      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              uuid: 'token-uuid',
              server_uuid: mockServerUuid,
              access_token_encrypted: encryptField('access_token'),
              refresh_token_encrypted: encryptField('refresh_token'),
              refresh_token_used_at: null,
              refresh_token_locked_at: recentLock, // LOCKED BY ANOTHER REQUEST
              expires_at: new Date(Date.now() - 1000),
            }]),
          }),
        }),
      });

      const result = await refreshOAuthToken(mockServerUuid, mockUserId);

      // Should return true, trusting the other request to complete
      expect(result).toBe(true);

      // Should NOT call token endpoint (another request is handling it)
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should proceed with stale lock (lock age > 60s)', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');
      const { encryptField } = await import('@/lib/encryption');
      const { log } = await import('@/lib/observability/logger');

      mockServerOwnership(db);
      await mockOAuthConfig();

      // Token locked 90 seconds ago (stale lock from failed previous attempt)
      const staleLock = new Date(Date.now() - 90 * 1000);

      let updateCount = 0;
      (db.update as any).mockImplementation(() => ({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(() => {
              updateCount++;
              if (updateCount === 1) {
                return Promise.resolve([{
                  uuid: 'token-uuid',
                  server_uuid: mockServerUuid,
                  access_token_encrypted: encryptField('old_token'),
                  refresh_token_encrypted: encryptField('old_refresh'),
                  refresh_token_used_at: null,
                  refresh_token_locked_at: staleLock, // STALE LOCK
                  expires_at: new Date(Date.now() - 1000),
                }]);
              } else {
                return Promise.resolve([{
                  uuid: 'token-uuid',
                  server_uuid: mockServerUuid,
                  access_token_encrypted: encryptField('new_token'),
                  refresh_token_encrypted: encryptField('new_refresh'),
                  refresh_token_used_at: new Date(),
                  refresh_token_locked_at: null,
                  expires_at: new Date(Date.now() + 3600000),
                }]);
              }
            }),
          }),
        }),
      }));

      global.fetch = vi.fn().mockResolvedValue(mockApiResponse({
        access_token: 'new_token',
        refresh_token: 'new_refresh',
        token_type: 'Bearer',
        expires_in: 3600,
      }));

      (db.query.mcpServersTable.findFirst as any).mockResolvedValue({
        uuid: mockServerUuid,
        streamable_http_options_encrypted: encryptField({ headers: {} }),
      });

      const result = await refreshOAuthToken(mockServerUuid, mockUserId);

      expect(result).toBe(true);
      expect(log.oauth).toHaveBeenCalledWith(
        'token_refresh_stale_lock_detected',
        expect.objectContaining({
          serverUuid: mockServerUuid,
          lockAgeMs: expect.any(Number),
        })
      );
      expect(global.fetch).toHaveBeenCalled(); // Should proceed with refresh
    });

    it('should prevent race condition between check and mark', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');
      const { encryptField } = await import('@/lib/encryption');

      mockServerOwnership(db);
      await mockOAuthConfig();

      // Simulate two concurrent refresh attempts
      let firstRequestPassed = false;
      let secondRequestPassed = false;

      (db.update as any).mockImplementation(() => ({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(() => {
              if (!firstRequestPassed) {
                firstRequestPassed = true;
                // First request gets the lock
                return Promise.resolve([{
                  uuid: 'token-uuid',
                  server_uuid: mockServerUuid,
                  access_token_encrypted: encryptField('token'),
                  refresh_token_encrypted: encryptField('refresh'),
                  refresh_token_used_at: null,
                  refresh_token_locked_at: new Date(), // LOCKED
                  expires_at: new Date(Date.now() - 1000),
                }]);
              } else {
                secondRequestPassed = true;
                // Second request sees the lock from first request
                return Promise.resolve([{
                  uuid: 'token-uuid',
                  server_uuid: mockServerUuid,
                  access_token_encrypted: encryptField('token'),
                  refresh_token_encrypted: encryptField('refresh'),
                  refresh_token_used_at: null,
                  refresh_token_locked_at: new Date(Date.now() - 1000), // Locked by first request
                  expires_at: new Date(Date.now() - 1000),
                }]);
              }
            }),
          }),
        }),
      }));

      global.fetch = vi.fn().mockResolvedValue(mockApiResponse({
        access_token: 'new_token',
        refresh_token: 'new_refresh',
        token_type: 'Bearer',
        expires_in: 3600,
      }));

      (db.query.mcpServersTable.findFirst as any).mockResolvedValue({
        uuid: mockServerUuid,
        streamable_http_options_encrypted: encryptField({ headers: {} }),
      });

      // First request
      const result1 = await refreshOAuthToken(mockServerUuid, mockUserId);

      // Second concurrent request
      const result2 = await refreshOAuthToken(mockServerUuid, mockUserId);

      // Both should succeed, but only one should call token endpoint
      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(firstRequestPassed).toBe(true);
      expect(secondRequestPassed).toBe(true);
    });
  });

  describe('Token Rotation (OAuth 2.1)', () => {
    it('should rotate refresh token on successful refresh', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');
      const { encryptField } = await import('@/lib/encryption');

      mockServerOwnership(db);
      await mockOAuthConfig();

      const oldRefreshToken = 'old_refresh_token';
      const newRefreshToken = 'new_refresh_token';

      let savedRefreshToken: string | null = null;

      (db.update as any).mockImplementation(() => ({
        set: vi.fn().mockImplementation((values: any) => {
          if (values.refresh_token_encrypted) {
            savedRefreshToken = values.refresh_token_encrypted;
          }
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockImplementation(() => {
                if (!savedRefreshToken) {
                  return Promise.resolve([{
                    uuid: 'token-uuid',
                    server_uuid: mockServerUuid,
                    access_token_encrypted: encryptField('old_access'),
                    refresh_token_encrypted: encryptField(oldRefreshToken),
                    refresh_token_used_at: null,
                    refresh_token_locked_at: new Date(),
                    expires_at: new Date(Date.now() - 1000),
                  }]);
                } else {
                  return Promise.resolve([{
                    uuid: 'token-uuid',
                    server_uuid: mockServerUuid,
                    access_token_encrypted: encryptField('new_access'),
                    refresh_token_encrypted: savedRefreshToken,
                    refresh_token_used_at: new Date(),
                    refresh_token_locked_at: null,
                    expires_at: new Date(Date.now() + 3600000),
                  }]);
                }
              }),
            }),
          };
        }),
      }));

      global.fetch = vi.fn().mockResolvedValue(mockApiResponse({
        access_token: 'new_access_token',
        refresh_token: newRefreshToken, // NEW REFRESH TOKEN
        token_type: 'Bearer',
        expires_in: 3600,
      }));

      (db.query.mcpServersTable.findFirst as any).mockResolvedValue({
        uuid: mockServerUuid,
        streamable_http_options_encrypted: encryptField({ headers: {} }),
      });

      await refreshOAuthToken(mockServerUuid, mockUserId);

      // Should have saved NEW refresh token
      expect(savedRefreshToken).toBe(encryptField(newRefreshToken));
    });

    it('should keep old refresh token if server does not provide new one', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');
      const { encryptField } = await import('@/lib/encryption');

      mockServerOwnership(db);
      await mockOAuthConfig();

      const oldRefreshToken = 'old_refresh_token';

      (db.update as any).mockImplementation(() => ({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              uuid: 'token-uuid',
              server_uuid: mockServerUuid,
              access_token_encrypted: encryptField('token'),
              refresh_token_encrypted: encryptField(oldRefreshToken),
              refresh_token_used_at: null,
              refresh_token_locked_at: new Date(),
              expires_at: new Date(Date.now() - 1000),
            }]),
          }),
        }),
      }));

      // Token endpoint response WITHOUT refresh token
      global.fetch = vi.fn().mockResolvedValue(mockApiResponse({
        access_token: 'new_access_token',
        // NO refresh_token field
        token_type: 'Bearer',
        expires_in: 3600,
      }));

      (db.query.mcpServersTable.findFirst as any).mockResolvedValue({
        uuid: mockServerUuid,
        streamable_http_options_encrypted: encryptField({ headers: {} }),
      });

      const result = await refreshOAuthToken(mockServerUuid, mockUserId);

      // Should still succeed, keeping old refresh token
      expect(result).toBe(true);
    });

    it('should mark old refresh token as used when new one is provided', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');
      const { encryptField } = await import('@/lib/encryption');

      mockServerOwnership(db);
      await mockOAuthConfig();

      let refreshTokenUsedAt: Date | null = null;

      (db.update as any).mockImplementation(() => ({
        set: vi.fn().mockImplementation((values: any) => {
          if (values.refresh_token_used_at) {
            refreshTokenUsedAt = values.refresh_token_used_at;
          }
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{
                uuid: 'token-uuid',
                server_uuid: mockServerUuid,
                access_token_encrypted: encryptField('new_access'),
                refresh_token_encrypted: encryptField('new_refresh'),
                refresh_token_used_at: refreshTokenUsedAt,
                refresh_token_locked_at: null,
                expires_at: new Date(Date.now() + 3600000),
              }]),
            }),
          };
        }),
      }));

      global.fetch = vi.fn().mockResolvedValue(mockApiResponse({
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        token_type: 'Bearer',
        expires_in: 3600,
      }));

      (db.query.mcpServersTable.findFirst as any).mockResolvedValue({
        uuid: mockServerUuid,
        streamable_http_options_encrypted: encryptField({ headers: {} }),
      });

      await refreshOAuthToken(mockServerUuid, mockUserId);

      expect(refreshTokenUsedAt).toBeInstanceOf(Date);
    });
  });

  describe('Error Recovery and Lock Cleanup', () => {
    it('should clear lock on token endpoint error', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');
      const { encryptField } = await import('@/lib/encryption');
      const { log } = await import('@/lib/observability/logger');

      mockServerOwnership(db);
      await mockOAuthConfig();

      let lockCleared = false;

      (db.update as any).mockImplementation(() => ({
        set: vi.fn().mockImplementation((values: any) => {
          if (values.refresh_token_locked_at === null) {
            lockCleared = true;
          }
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{
                uuid: 'token-uuid',
                server_uuid: mockServerUuid,
                access_token_encrypted: encryptField('token'),
                refresh_token_encrypted: encryptField('refresh'),
                refresh_token_used_at: null,
                refresh_token_locked_at: lockCleared ? null : new Date(),
                expires_at: new Date(Date.now() - 1000),
              }]),
            }),
          };
        }),
      }));

      // Token endpoint returns error
      global.fetch = vi.fn().mockResolvedValue(mockApiError('invalid_grant', 400));

      const result = await refreshOAuthToken(mockServerUuid, mockUserId);

      expect(result).toBe(false);
      expect(lockCleared).toBe(true);
      expect(log.oauth).toHaveBeenCalledWith(
        'token_refresh_lock_cleared',
        expect.objectContaining({
          serverUuid: mockServerUuid,
          reason: 'endpoint_error',
        })
      );
    });

    it('should clear lock on exception', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');
      const { encryptField } = await import('@/lib/encryption');

      mockServerOwnership(db);
      await mockOAuthConfig();

      let lockCleared = false;

      (db.update as any).mockImplementation(() => ({
        set: vi.fn().mockImplementation((values: any) => {
          if (values.refresh_token_locked_at === null) {
            lockCleared = true;
          }
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{
                uuid: 'token-uuid',
                server_uuid: mockServerUuid,
                access_token_encrypted: encryptField('token'),
                refresh_token_encrypted: encryptField('refresh'),
                refresh_token_used_at: null,
                refresh_token_locked_at: lockCleared ? null : new Date(),
                expires_at: new Date(Date.now() - 1000),
              }]),
            }),
          };
        }),
      }));

      // Simulate network error
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await refreshOAuthToken(mockServerUuid, mockUserId);

      expect(result).toBe(false);
      expect(lockCleared).toBe(true);
    });

    it('should handle unlock failures gracefully', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');
      const { encryptField } = await import('@/lib/encryption');
      const { log } = await import('@/lib/observability/logger');

      mockServerOwnership(db);
      await mockOAuthConfig();

      let attemptedUnlock = false;

      (db.update as any).mockImplementation(() => ({
        set: vi.fn().mockImplementation((values: any) => {
          if (values.refresh_token_locked_at === null) {
            attemptedUnlock = true;
            // Unlock fails
            throw new Error('Database connection lost');
          }
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{
                uuid: 'token-uuid',
                server_uuid: mockServerUuid,
                access_token_encrypted: encryptField('token'),
                refresh_token_encrypted: encryptField('refresh'),
                refresh_token_used_at: null,
                refresh_token_locked_at: new Date(),
                expires_at: new Date(Date.now() - 1000),
              }]),
            }),
          };
        }),
      }));

      global.fetch = vi.fn().mockRejectedValue(new Error('Fetch error'));

      const result = await refreshOAuthToken(mockServerUuid, mockUserId);

      expect(result).toBe(false);
      expect(attemptedUnlock).toBe(true);
      expect(log.error).toHaveBeenCalledWith(
        'OAuth Refresh: Failed to clear lock',
        expect.any(Error),
        expect.objectContaining({ serverUuid: mockServerUuid })
      );
    });
  });

  describe('Token Update in Streamable HTTP Options', () => {
    it('should update Authorization header with new access token', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');
      const { encryptField } = await import('@/lib/encryption');

      mockServerOwnership(db);
      await mockOAuthConfig();

      const newAccessToken = 'new_access_token_xyz';
      let updatedHeaders: any = null;

      (db.update as any).mockImplementation(() => ({
        set: vi.fn().mockImplementation((values: any) => {
          if (values.streamable_http_options_encrypted) {
            const decrypted = JSON.parse(
              values.streamable_http_options_encrypted.substring(10)
            );
            updatedHeaders = decrypted.headers;
          }
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{
                uuid: 'token-uuid',
                server_uuid: mockServerUuid,
                access_token_encrypted: encryptField(newAccessToken),
                refresh_token_encrypted: encryptField('new_refresh'),
                refresh_token_used_at: new Date(),
                refresh_token_locked_at: null,
                expires_at: new Date(Date.now() + 3600000),
              }]),
            }),
          };
        }),
      }));

      global.fetch = vi.fn().mockResolvedValue(mockApiResponse({
        access_token: newAccessToken,
        refresh_token: 'new_refresh_token',
        token_type: 'Bearer',
        expires_in: 3600,
      }));

      (db.query.mcpServersTable.findFirst as any).mockResolvedValue({
        uuid: mockServerUuid,
        streamable_http_options_encrypted: encryptField({
          headers: { 'X-Custom': 'value' },
        }),
      });

      await refreshOAuthToken(mockServerUuid, mockUserId);

      expect(updatedHeaders).toBeDefined();
      expect(updatedHeaders.Authorization).toBe(`Bearer ${newAccessToken}`);
      expect(updatedHeaders['X-Custom']).toBe('value'); // Preserves existing headers
    });

    it('should normalize token_type to capitalized format', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');
      const { encryptField } = await import('@/lib/encryption');

      mockServerOwnership(db);
      await mockOAuthConfig();

      let authHeader: string | null = null;

      (db.update as any).mockImplementation(() => ({
        set: vi.fn().mockImplementation((values: any) => {
          if (values.streamable_http_options_encrypted) {
            const decrypted = JSON.parse(
              values.streamable_http_options_encrypted.substring(10)
            );
            authHeader = decrypted.headers.Authorization;
          }
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{
                uuid: 'token-uuid',
                server_uuid: mockServerUuid,
                access_token_encrypted: encryptField('token'),
                refresh_token_encrypted: encryptField('refresh'),
                refresh_token_used_at: new Date(),
                refresh_token_locked_at: null,
                expires_at: new Date(Date.now() + 3600000),
              }]),
            }),
          };
        }),
      }));

      // Server returns lowercase token_type
      global.fetch = vi.fn().mockResolvedValue(mockApiResponse({
        access_token: 'new_token',
        refresh_token: 'new_refresh',
        token_type: 'bearer', // LOWERCASE
        expires_in: 3600,
      }));

      (db.query.mcpServersTable.findFirst as any).mockResolvedValue({
        uuid: mockServerUuid,
        streamable_http_options_encrypted: encryptField({ headers: {} }),
      });

      await refreshOAuthToken(mockServerUuid, mockUserId);

      // Should be normalized to "Bearer" (capitalized)
      expect(authHeader).toBe('Bearer new_token');
    });
  });
});
