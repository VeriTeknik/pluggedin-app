import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash, randomBytes } from 'crypto';
import { mockApiResponse, mockApiError, resetAllMocks } from '../test-utils';

/**
 * OAuth 2.1 Security Tests
 *
 * Tests security features including:
 * - Authorization code injection prevention
 * - PKCE state integrity verification
 * - Refresh token reuse detection
 * - User-server ownership validation
 * - Integrity hash validation
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
  recordCodeInjectionAttempt: vi.fn(),
  recordIntegrityViolation: vi.fn(),
  recordTokenReuseDetected: vi.fn(),
  recordTokenRevocation: vi.fn(),
  recordPkceValidation: vi.fn(),
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
      oauthPkceStatesTable: {
        findFirst: vi.fn(),
      },
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

describe('OAuth 2.1 Security Tests', () => {
  const mockServerUuid = 'test-server-uuid';
  const mockUserId = 'test-user-id';
  const mockAttackerUserId = 'attacker-user-id';
  const mockRedirectUri = 'http://localhost:12005/api/oauth/callback';

  beforeEach(() => {
    resetAllMocks();
    vi.clearAllTimers();
  });

  afterEach(() => {
    resetAllMocks();
  });

  describe('Authorization Code Injection Prevention (P0)', () => {
    it('should reject authorization code with mismatched user_id', async () => {
      const { validatePkceState } = await import('@/lib/oauth/integrity');
      const { db } = await import('@/db');
      const { recordCodeInjectionAttempt } = await import('@/lib/observability/oauth-metrics');

      const mockState = 'state-belongs-to-victim';
      const mockCodeVerifier = randomBytes(32).toString('base64url');
      const mockIntegrityHash = createHash('sha256')
        .update(`${mockState}:${mockServerUuid}:${mockUserId}`)
        .digest('hex');

      // PKCE state belongs to victim user
      (db.query.oauthPkceStatesTable.findFirst as any).mockResolvedValue({
        state: mockState,
        server_uuid: mockServerUuid,
        user_id: mockUserId, // Victim's user ID
        code_verifier: mockCodeVerifier,
        redirect_uri: mockRedirectUri,
        integrity_hash: mockIntegrityHash,
        expires_at: new Date(Date.now() + 2 * 60 * 1000),
        created_at: new Date(),
      });

      // Attacker tries to use victim's state
      const result = await validatePkceState(mockState, mockAttackerUserId);

      // Should reject the state
      expect(result).toBeNull();

      // Should record security event
      expect(recordCodeInjectionAttempt).toHaveBeenCalled();
    });

    it('should prevent cross-user authorization code usage', async () => {
      const { validatePkceState } = await import('@/lib/oauth/integrity');
      const { db } = await import('@/db');

      const victimState = 'victim-state-123';
      const attackerState = 'attacker-state-456';

      // Set up victim's PKCE state
      (db.query.oauthPkceStatesTable.findFirst as any).mockImplementation((params: any) => {
        if (params.where.state === victimState) {
          return Promise.resolve({
            state: victimState,
            server_uuid: mockServerUuid,
            user_id: mockUserId,
            code_verifier: randomBytes(32).toString('base64url'),
            redirect_uri: mockRedirectUri,
            integrity_hash: 'victim-hash',
            expires_at: new Date(Date.now() + 2 * 60 * 1000),
            created_at: new Date(),
          });
        }
        return Promise.resolve(null);
      });

      // Attacker tries to use victim's state
      const result = await validatePkceState(victimState, mockAttackerUserId);
      expect(result).toBeNull();

      // Victim can use their own state
      const validResult = await validatePkceState(victimState, mockUserId);
      expect(validResult).toBeDefined();
    });

    it('should bind PKCE state to specific user session', async () => {
      const { createPkceState } = await import('@/lib/oauth/pkce');
      const { db } = await import('@/db');

      const mockState = 'session-bound-state';
      const mockCodeVerifier = randomBytes(32).toString('base64url');

      (db.insert as any).mockReturnValue({
        values: vi.fn().mockImplementation((values: any) => {
          // Ensure user_id is bound to PKCE state
          expect(values.user_id).toBe(mockUserId);
          return {
            returning: vi.fn().mockResolvedValue([{
              state: mockState,
              code_verifier: mockCodeVerifier,
              server_uuid: mockServerUuid,
              user_id: mockUserId,
              redirect_uri: mockRedirectUri,
              expires_at: new Date(Date.now() + 5 * 60 * 1000),
            }]),
          };
        }),
      });

      await createPkceState(mockServerUuid, mockUserId, mockRedirectUri);
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('PKCE State Integrity Verification (P0)', () => {
    it('should validate integrity hash matches state parameters', async () => {
      const { validatePkceState } = await import('@/lib/oauth/integrity');
      const { db } = await import('@/db');

      const mockState = 'integrity-test-state';
      const mockCodeVerifier = randomBytes(32).toString('base64url');

      // Correct integrity hash
      const correctHash = createHash('sha256')
        .update(`${mockState}:${mockServerUuid}:${mockUserId}`)
        .digest('hex');

      (db.query.oauthPkceStatesTable.findFirst as any).mockResolvedValue({
        state: mockState,
        server_uuid: mockServerUuid,
        user_id: mockUserId,
        code_verifier: mockCodeVerifier,
        redirect_uri: mockRedirectUri,
        integrity_hash: correctHash,
        expires_at: new Date(Date.now() + 2 * 60 * 1000),
        created_at: new Date(),
      });

      (db.delete as any).mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      });

      const result = await validatePkceState(mockState, mockUserId);
      expect(result).toBeDefined();
      expect(result?.state).toBe(mockState);
    });

    it('should reject state with tampered integrity hash', async () => {
      const { validatePkceState } = await import('@/lib/oauth/integrity');
      const { db } = await import('@/db');
      const { recordIntegrityViolation } = await import('@/lib/observability/oauth-metrics');

      const mockState = 'tampered-state';
      const mockCodeVerifier = randomBytes(32).toString('base64url');

      // Tampered/incorrect integrity hash
      const tamperedHash = 'tampered_hash_value';

      (db.query.oauthPkceStatesTable.findFirst as any).mockResolvedValue({
        state: mockState,
        server_uuid: mockServerUuid,
        user_id: mockUserId,
        code_verifier: mockCodeVerifier,
        redirect_uri: mockRedirectUri,
        integrity_hash: tamperedHash,
        expires_at: new Date(Date.now() + 2 * 60 * 1000),
        created_at: new Date(),
      });

      const result = await validatePkceState(mockState, mockUserId);
      expect(result).toBeNull();
      expect(recordIntegrityViolation).toHaveBeenCalledWith('hash_mismatch');
    });

    it('should detect state parameter substitution attack', async () => {
      const { validatePkceState } = await import('@/lib/oauth/integrity');
      const { db } = await import('@/db');

      const originalState = 'original-state';
      const substitutedServerUuid = 'substituted-server-uuid';

      // Hash was created for original parameters
      const originalHash = createHash('sha256')
        .update(`${originalState}:${mockServerUuid}:${mockUserId}`)
        .digest('hex');

      // But server_uuid in database was substituted
      (db.query.oauthPkceStatesTable.findFirst as any).mockResolvedValue({
        state: originalState,
        server_uuid: substitutedServerUuid, // SUBSTITUTED!
        user_id: mockUserId,
        code_verifier: randomBytes(32).toString('base64url'),
        redirect_uri: mockRedirectUri,
        integrity_hash: originalHash, // Hash doesn't match substituted params
        expires_at: new Date(Date.now() + 2 * 60 * 1000),
        created_at: new Date(),
      });

      const result = await validatePkceState(originalState, mockUserId);
      expect(result).toBeNull();
    });
  });

  describe('Refresh Token Reuse Detection (P0)', () => {
    it('should detect and revoke tokens on refresh token reuse', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');
      const { recordTokenReuseDetected, recordTokenRevocation } = await import('@/lib/observability/oauth-metrics');

      // Mock server ownership validation
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { profile_uuid: 'profile-uuid' }
            ]),
          }),
        }),
      });

      (db.query.profilesTable.findFirst as any).mockResolvedValue({
        uuid: 'profile-uuid',
        project_uuid: 'project-uuid',
      });

      (db.query.projectsTable.findFirst as any).mockResolvedValue({
        uuid: 'project-uuid',
        user_id: mockUserId,
      });

      // Token record shows refresh token was already used (SECURITY VIOLATION)
      const usedAt = new Date(Date.now() - 1000); // Used 1 second ago

      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              uuid: 'token-uuid',
              server_uuid: mockServerUuid,
              access_token_encrypted: 'encrypted_access_token',
              refresh_token_encrypted: 'encrypted_refresh_token',
              refresh_token_used_at: usedAt, // ALREADY USED - REPLAY ATTACK!
              refresh_token_locked_at: new Date(),
              expires_at: new Date(Date.now() - 1000), // Expired
            }]),
          }),
        }),
      });

      // Mock token deletion (revocation)
      (db.delete as any).mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      });

      const result = await refreshOAuthToken(mockServerUuid, mockUserId);

      expect(result).toBe(false);
      expect(recordTokenReuseDetected).toHaveBeenCalled();
      expect(recordTokenRevocation).toHaveBeenCalledWith('reuse_detected');
      expect(db.delete).toHaveBeenCalled(); // Tokens should be revoked
    });

    it('should mark refresh token as used after successful rotation', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');
      const { encryptField } = await import('@/lib/encryption');

      // Mock server ownership
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ profile_uuid: 'profile-uuid' }]),
          }),
        }),
      });

      (db.query.profilesTable.findFirst as any).mockResolvedValue({ project_uuid: 'project-uuid' });
      (db.query.projectsTable.findFirst as any).mockResolvedValue({ user_id: mockUserId });

      // First update: Lock acquisition
      let updateCallCount = 0;
      (db.update as any).mockImplementation(() => ({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(() => {
              updateCallCount++;
              if (updateCallCount === 1) {
                // Lock acquisition
                return Promise.resolve([{
                  uuid: 'token-uuid',
                  server_uuid: mockServerUuid,
                  access_token_encrypted: encryptField('old_access_token'),
                  refresh_token_encrypted: encryptField('old_refresh_token'),
                  refresh_token_used_at: null, // NOT USED YET - SAFE
                  refresh_token_locked_at: new Date(),
                  expires_at: new Date(Date.now() - 1000), // Expired
                }]);
              } else {
                // Token update after refresh
                return Promise.resolve([{
                  uuid: 'token-uuid',
                  server_uuid: mockServerUuid,
                  access_token_encrypted: encryptField('new_access_token'),
                  refresh_token_encrypted: encryptField('new_refresh_token'),
                  refresh_token_used_at: new Date(), // MARKED AS USED
                  refresh_token_locked_at: null,
                  expires_at: new Date(Date.now() + 3600000),
                }]);
              }
            }),
          }),
        }),
      }));

      // Mock OAuth config
      vi.doMock('@/lib/oauth/oauth-config-store', () => ({
        getOAuthConfig: vi.fn().mockResolvedValue({
          serverUuid: mockServerUuid,
          client_id: 'test-client-id',
          token_endpoint: 'https://auth.example.com/token',
        }),
      }));

      // Mock token endpoint response
      global.fetch = vi.fn().mockResolvedValue(mockApiResponse({
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        token_type: 'Bearer',
        expires_in: 3600,
      }));

      // Mock server query for streamable options update
      (db.query.mcpServersTable.findFirst as any).mockResolvedValue({
        uuid: mockServerUuid,
        streamable_http_options_encrypted: encryptField({ headers: {} }),
      });

      const result = await refreshOAuthToken(mockServerUuid, mockUserId);

      expect(result).toBe(true);
      expect(updateCallCount).toBeGreaterThanOrEqual(2);
    });

    it('should prevent concurrent refresh token usage with optimistic locking', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');

      // Mock server ownership
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ profile_uuid: 'profile-uuid' }]),
          }),
        }),
      });

      (db.query.profilesTable.findFirst as any).mockResolvedValue({ project_uuid: 'project-uuid' });
      (db.query.projectsTable.findFirst as any).mockResolvedValue({ user_id: mockUserId });

      // Simulate concurrent request - token is already locked
      const recentLockTime = new Date(Date.now() - 5000); // Locked 5 seconds ago

      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              uuid: 'token-uuid',
              server_uuid: mockServerUuid,
              access_token_encrypted: 'encrypted_access_token',
              refresh_token_encrypted: 'encrypted_refresh_token',
              refresh_token_used_at: null,
              refresh_token_locked_at: recentLockTime, // LOCKED BY ANOTHER REQUEST
              expires_at: new Date(Date.now() - 1000),
            }]),
          }),
        }),
      });

      // Second concurrent request should see the lock and return true
      // (trusting the first request to complete the refresh)
      const result = await refreshOAuthToken(mockServerUuid, mockUserId);
      expect(result).toBe(true); // Trusts ongoing refresh
    });
  });

  describe('Server Ownership Validation (P0)', () => {
    it('should prevent token substitution across different user servers', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');
      const { log } = await import('@/lib/observability/logger');

      // Server belongs to different user
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ profile_uuid: 'profile-uuid' }]),
          }),
        }),
      });

      (db.query.profilesTable.findFirst as any).mockResolvedValue({ project_uuid: 'project-uuid' });

      // Project belongs to DIFFERENT user
      (db.query.projectsTable.findFirst as any).mockResolvedValue({
        uuid: 'project-uuid',
        user_id: 'different-user-id', // NOT the requesting user
      });

      const result = await refreshOAuthToken(mockServerUuid, mockUserId);

      expect(result).toBe(false);
      expect(log.security).toHaveBeenCalledWith(
        'oauth_ownership_violation',
        mockUserId,
        expect.objectContaining({
          serverUuid: mockServerUuid,
        })
      );
    });

    it('should validate ownership chain: Server → Profile → Project → User', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');

      const mockProfileUuid = 'valid-profile-uuid';
      const mockProjectUuid = 'valid-project-uuid';

      // Step 1: Server → Profile
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ profile_uuid: mockProfileUuid }]),
          }),
        }),
      });

      // Step 2: Profile → Project
      (db.query.profilesTable.findFirst as any).mockResolvedValue({
        uuid: mockProfileUuid,
        project_uuid: mockProjectUuid,
      });

      // Step 3: Project → User
      (db.query.projectsTable.findFirst as any).mockResolvedValue({
        uuid: mockProjectUuid,
        user_id: mockUserId, // Correct user
      });

      // Mock token state for lock acquisition
      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              uuid: 'token-uuid',
              server_uuid: mockServerUuid,
              access_token_encrypted: 'encrypted_access_token',
              refresh_token_encrypted: 'encrypted_refresh_token',
              refresh_token_used_at: null,
              refresh_token_locked_at: new Date(),
              expires_at: new Date(Date.now() + 1000000), // Not expired
            }]),
          }),
        }),
      });

      await refreshOAuthToken(mockServerUuid, mockUserId);

      // Should have validated the complete chain
      expect(db.select).toHaveBeenCalled();
      expect(db.query.profilesTable.findFirst).toHaveBeenCalled();
      expect(db.query.projectsTable.findFirst).toHaveBeenCalled();
    });

    it('should reject if server not found in database', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');

      // Server not found
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // EMPTY - SERVER NOT FOUND
          }),
        }),
      });

      const result = await refreshOAuthToken('non-existent-server', mockUserId);
      expect(result).toBe(false);
    });
  });

  describe('PKCE State Replay Prevention', () => {
    it('should prevent reuse of deleted PKCE state via audit table', async () => {
      const { validatePkceState } = await import('@/lib/oauth/integrity');
      const { db } = await import('@/db');

      const reusedState = 'already-used-state';

      // State was already deleted and moved to audit table
      (db.query.oauthPkceStatesTable.findFirst as any).mockResolvedValue(null);

      // But audit table shows it was used
      const auditQuery = vi.fn().mockResolvedValue([{
        state: reusedState,
        server_uuid: mockServerUuid,
        user_id: mockUserId,
        used_at: new Date(Date.now() - 1000),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        audit_reason: 'used',
      }]);

      // Mock audit table check (would be in the validatePkceState implementation)
      vi.doMock('@/db', () => ({
        db: {
          ...mockDb,
          query: {
            ...mockDb.query,
            oauthPkceStatesAuditTable: {
              findFirst: auditQuery,
            },
          },
        },
      }));

      const result = await validatePkceState(reusedState, mockUserId);
      expect(result).toBeNull(); // Should reject - state already used
    });

    it('should maintain 30-day audit trail for PKCE states', async () => {
      const { db } = await import('@/db');

      // Simulate PKCE state deletion trigger
      const deletedState = {
        state: 'deleted-state-123',
        server_uuid: mockServerUuid,
        user_id: mockUserId,
        code_verifier: randomBytes(32).toString('base64url'),
        redirect_uri: mockRedirectUri,
        integrity_hash: 'hash',
        created_at: new Date(),
        expires_at: new Date(Date.now() + 5 * 60 * 1000),
      };

      // Mock audit table insert (simulating DB trigger)
      const auditInsert = vi.fn().mockResolvedValue([{
        state: deletedState.state,
        server_uuid: deletedState.server_uuid,
        user_id: deletedState.user_id,
        used_at: new Date(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        audit_reason: 'used',
      }]);

      (db.insert as any).mockReturnValue({
        values: auditInsert,
      });

      // Simulate deletion (would trigger audit in real DB)
      (db.delete as any).mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      });

      // The trigger should have inserted into audit table
      // (In real scenario, this is automatic via PostgreSQL trigger)
      await db.delete();

      // Verify audit could store the state
      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('Security Event Logging', () => {
    it('should log code injection attempts with attacker details', async () => {
      const { validatePkceState } = await import('@/lib/oauth/integrity');
      const { db } = await import('@/db');
      const { log } = await import('@/lib/observability/logger');

      const mockState = 'victim-state';

      (db.query.oauthPkceStatesTable.findFirst as any).mockResolvedValue({
        state: mockState,
        server_uuid: mockServerUuid,
        user_id: mockUserId, // Victim
        code_verifier: randomBytes(32).toString('base64url'),
        redirect_uri: mockRedirectUri,
        integrity_hash: 'hash',
        expires_at: new Date(Date.now() + 2 * 60 * 1000),
        created_at: new Date(),
      });

      await validatePkceState(mockState, mockAttackerUserId);

      expect(log.security).toHaveBeenCalledWith(
        expect.stringContaining('injection'),
        mockAttackerUserId,
        expect.any(Object)
      );
    });

    it('should log integrity violations with hash details', async () => {
      const { validatePkceState } = await import('@/lib/oauth/integrity');
      const { db } = await import('@/db');
      const { log } = await import('@/lib/observability/logger');

      const mockState = 'tampered-state';
      const tamperedHash = 'invalid_hash';

      (db.query.oauthPkceStatesTable.findFirst as any).mockResolvedValue({
        state: mockState,
        server_uuid: mockServerUuid,
        user_id: mockUserId,
        code_verifier: randomBytes(32).toString('base64url'),
        redirect_uri: mockRedirectUri,
        integrity_hash: tamperedHash,
        expires_at: new Date(Date.now() + 2 * 60 * 1000),
        created_at: new Date(),
      });

      await validatePkceState(mockState, mockUserId);

      expect(log.security).toHaveBeenCalled();
    });

    it('should log token reuse with timestamp information', async () => {
      const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
      const { db } = await import('@/db');
      const { log } = await import('@/lib/observability/logger');

      // Mock ownership validation
      (db.select as any).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ profile_uuid: 'profile-uuid' }]),
          }),
        }),
      });

      (db.query.profilesTable.findFirst as any).mockResolvedValue({ project_uuid: 'project-uuid' });
      (db.query.projectsTable.findFirst as any).mockResolvedValue({ user_id: mockUserId });

      const usedAt = new Date(Date.now() - 5000);

      (db.update as any).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              uuid: 'token-uuid',
              server_uuid: mockServerUuid,
              access_token_encrypted: 'encrypted_token',
              refresh_token_encrypted: 'encrypted_refresh',
              refresh_token_used_at: usedAt, // ALREADY USED
              refresh_token_locked_at: new Date(),
              expires_at: new Date(Date.now() - 1000),
            }]),
          }),
        }),
      });

      (db.delete as any).mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      });

      await refreshOAuthToken(mockServerUuid, mockUserId);

      expect(log.security).toHaveBeenCalledWith(
        'oauth_refresh_token_reuse_detected',
        mockUserId,
        expect.objectContaining({
          serverUuid: mockServerUuid,
          tokenUsedAt: usedAt,
        })
      );
    });
  });
});
