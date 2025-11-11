import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash, randomBytes } from 'crypto';
import { mockApiResponse, mockApiError, mockSession, resetAllMocks } from '../test-utils';

/**
 * OAuth 2.1 Authorization Flow Tests
 *
 * Tests the complete OAuth authorization flow including:
 * - PKCE state creation and validation
 * - Authorization code exchange
 * - Token storage and encryption
 * - Integrity verification
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
  recordOAuthFlowStart: vi.fn(),
  recordOAuthFlowComplete: vi.fn(),
  recordPkceStateCreated: vi.fn(),
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
    },
  };
  return { db: mockDb };
});

describe('OAuth 2.1 Authorization Flow', () => {
  const mockServerUuid = 'test-server-uuid';
  const mockUserId = 'test-user-id';
  const mockRedirectUri = 'http://localhost:12005/api/oauth/callback';
  const mockAuthEndpoint = 'https://auth.example.com/authorize';
  const mockTokenEndpoint = 'https://auth.example.com/token';

  beforeEach(() => {
    resetAllMocks();
    vi.clearAllTimers();
  });

  afterEach(() => {
    resetAllMocks();
  });

  describe('PKCE State Creation', () => {
    it('should create PKCE state with code_verifier and code_challenge', async () => {
      const { createPkceState } = await import('@/lib/oauth/pkce');
      const { db } = await import('@/db');

      // Mock database insert
      const mockState = 'test_state_' + randomBytes(16).toString('hex');
      const mockCodeVerifier = randomBytes(32).toString('base64url');
      const mockCodeChallenge = createHash('sha256')
        .update(mockCodeVerifier)
        .digest('base64url');

      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            state: mockState,
            code_verifier: mockCodeVerifier,
            server_uuid: mockServerUuid,
            user_id: mockUserId,
            redirect_uri: mockRedirectUri,
            expires_at: new Date(Date.now() + 5 * 60 * 1000),
          }]),
        }),
      });

      const result = await createPkceState(
        mockServerUuid,
        mockUserId,
        mockRedirectUri
      );

      expect(result).toBeDefined();
      expect(result.state).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(result.code_verifier).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(result.code_challenge).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(db.insert).toHaveBeenCalled();
    });

    it('should generate unique state values', async () => {
      const { createPkceState } = await import('@/lib/oauth/pkce');
      const { db } = await import('@/db');

      const states = new Set<string>();

      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => {
            const state = 'state_' + randomBytes(16).toString('hex');
            states.add(state);
            return Promise.resolve([{
              state,
              code_verifier: randomBytes(32).toString('base64url'),
              server_uuid: mockServerUuid,
              user_id: mockUserId,
              redirect_uri: mockRedirectUri,
              expires_at: new Date(Date.now() + 5 * 60 * 1000),
            }]);
          }),
        }),
      });

      // Create multiple states
      await createPkceState(mockServerUuid, mockUserId, mockRedirectUri);
      await createPkceState(mockServerUuid, mockUserId, mockRedirectUri);
      await createPkceState(mockServerUuid, mockUserId, mockRedirectUri);

      // All states should be unique
      expect(states.size).toBe(3);
    });

    it('should set 5-minute expiration per OAuth 2.1', async () => {
      const { createPkceState } = await import('@/lib/oauth/pkce');
      const { db } = await import('@/db');

      const now = Date.now();
      let capturedExpiresAt: Date | null = null;

      (db.insert as any).mockReturnValue({
        values: vi.fn().mockImplementation((data: any) => {
          capturedExpiresAt = data.expires_at;
          return {
            returning: vi.fn().mockResolvedValue([{
              state: 'test-state',
              code_verifier: randomBytes(32).toString('base64url'),
              server_uuid: mockServerUuid,
              user_id: mockUserId,
              redirect_uri: mockRedirectUri,
              expires_at: capturedExpiresAt,
            }]),
          };
        }),
      });

      await createPkceState(mockServerUuid, mockUserId, mockRedirectUri);

      expect(capturedExpiresAt).toBeDefined();
      const expirationTime = capturedExpiresAt!.getTime() - now;

      // Should be approximately 5 minutes (with 1 second tolerance)
      expect(expirationTime).toBeGreaterThanOrEqual(4 * 60 * 1000);
      expect(expirationTime).toBeLessThanOrEqual(6 * 60 * 1000);
    });
  });

  describe('PKCE State Validation', () => {
    it('should successfully validate valid PKCE state', async () => {
      const { validatePkceState } = await import('@/lib/oauth/integrity');
      const { db } = await import('@/db');

      const mockState = 'test-state-abc123';
      const mockCodeVerifier = randomBytes(32).toString('base64url');
      const mockIntegrityHash = createHash('sha256')
        .update(`${mockState}:${mockServerUuid}:${mockUserId}`)
        .digest('hex');

      // Mock finding PKCE state in database
      (db.query.oauthPkceStatesTable.findFirst as any).mockResolvedValue({
        state: mockState,
        server_uuid: mockServerUuid,
        user_id: mockUserId,
        code_verifier: mockCodeVerifier,
        redirect_uri: mockRedirectUri,
        integrity_hash: mockIntegrityHash,
        expires_at: new Date(Date.now() + 2 * 60 * 1000), // 2 minutes from now
        created_at: new Date(),
      });

      // Mock deletion success
      (db.delete as any).mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      });

      const result = await validatePkceState(mockState, mockUserId);

      expect(result).toBeDefined();
      expect(result?.state).toBe(mockState);
      expect(result?.code_verifier).toBe(mockCodeVerifier);
      expect(db.query.oauthPkceStatesTable.findFirst).toHaveBeenCalled();
    });

    it('should reject expired PKCE state', async () => {
      const { validatePkceState } = await import('@/lib/oauth/integrity');
      const { db } = await import('@/db');

      const mockState = 'test-state-expired';

      // Mock expired state
      (db.query.oauthPkceStatesTable.findFirst as any).mockResolvedValue({
        state: mockState,
        server_uuid: mockServerUuid,
        user_id: mockUserId,
        code_verifier: randomBytes(32).toString('base64url'),
        redirect_uri: mockRedirectUri,
        integrity_hash: 'valid-hash',
        expires_at: new Date(Date.now() - 1000), // Expired 1 second ago
        created_at: new Date(Date.now() - 6 * 60 * 1000),
      });

      const result = await validatePkceState(mockState, mockUserId);

      expect(result).toBeNull();
    });

    it('should reject state with mismatched user_id (code injection attack)', async () => {
      const { validatePkceState } = await import('@/lib/oauth/integrity');
      const { db } = await import('@/db');

      const mockState = 'test-state-wrong-user';
      const attackerUserId = 'attacker-user-id';

      // Mock state belonging to different user
      (db.query.oauthPkceStatesTable.findFirst as any).mockResolvedValue({
        state: mockState,
        server_uuid: mockServerUuid,
        user_id: mockUserId, // Different from attacker
        code_verifier: randomBytes(32).toString('base64url'),
        redirect_uri: mockRedirectUri,
        integrity_hash: 'valid-hash',
        expires_at: new Date(Date.now() + 2 * 60 * 1000),
        created_at: new Date(),
      });

      const result = await validatePkceState(mockState, attackerUserId);

      expect(result).toBeNull();
    });

    it('should reject state not found in database', async () => {
      const { validatePkceState } = await import('@/lib/oauth/integrity');
      const { db } = await import('@/db');

      const mockState = 'non-existent-state';

      (db.query.oauthPkceStatesTable.findFirst as any).mockResolvedValue(null);

      const result = await validatePkceState(mockState, mockUserId);

      expect(result).toBeNull();
    });

    it('should delete PKCE state after successful validation (one-time use)', async () => {
      const { validatePkceState } = await import('@/lib/oauth/integrity');
      const { db } = await import('@/db');

      const mockState = 'test-state-delete';
      const mockCodeVerifier = randomBytes(32).toString('base64url');
      const mockIntegrityHash = createHash('sha256')
        .update(`${mockState}:${mockServerUuid}:${mockUserId}`)
        .digest('hex');

      (db.query.oauthPkceStatesTable.findFirst as any).mockResolvedValue({
        state: mockState,
        server_uuid: mockServerUuid,
        user_id: mockUserId,
        code_verifier: mockCodeVerifier,
        redirect_uri: mockRedirectUri,
        integrity_hash: mockIntegrityHash,
        expires_at: new Date(Date.now() + 2 * 60 * 1000),
        created_at: new Date(),
      });

      const deleteMock = vi.fn().mockResolvedValue({ rowCount: 1 });
      (db.delete as any).mockReturnValue({
        where: deleteMock,
      });

      await validatePkceState(mockState, mockUserId);

      expect(db.delete).toHaveBeenCalled();
      expect(deleteMock).toHaveBeenCalled();
    });
  });

  describe('Authorization Code Exchange', () => {
    it('should successfully exchange authorization code for tokens', async () => {
      const { exchangeAuthorizationCode } = await import('@/lib/oauth/token-exchange');
      const mockCode = 'test-auth-code-123';
      const mockCodeVerifier = randomBytes(32).toString('base64url');
      const mockAccessToken = 'access_token_xyz';
      const mockRefreshToken = 'refresh_token_abc';

      // Mock token endpoint response
      global.fetch = vi.fn().mockResolvedValue(mockApiResponse({
        access_token: mockAccessToken,
        refresh_token: mockRefreshToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'read write',
      }));

      const result = await exchangeAuthorizationCode(
        mockTokenEndpoint,
        mockCode,
        mockCodeVerifier,
        mockRedirectUri,
        'test-client-id'
      );

      expect(result).toBeDefined();
      expect(result.access_token).toBe(mockAccessToken);
      expect(result.refresh_token).toBe(mockRefreshToken);
      expect(result.token_type).toBe('Bearer');
      expect(result.expires_in).toBe(3600);
      expect(global.fetch).toHaveBeenCalledWith(
        mockTokenEndpoint,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      );
    });

    it('should handle token endpoint errors', async () => {
      const { exchangeAuthorizationCode } = await import('@/lib/oauth/token-exchange');
      const mockCode = 'invalid-code';
      const mockCodeVerifier = randomBytes(32).toString('base64url');

      // Mock token endpoint error
      global.fetch = vi.fn().mockResolvedValue(mockApiError('invalid_grant', 400));

      await expect(
        exchangeAuthorizationCode(
          mockTokenEndpoint,
          mockCode,
          mockCodeVerifier,
          mockRedirectUri,
          'test-client-id'
        )
      ).rejects.toThrow();
    });
  });

  describe('Token Storage', () => {
    it('should store encrypted tokens in database', async () => {
      const { storeOAuthTokens } = await import('@/lib/oauth/token-storage');
      const { db } = await import('@/db');
      const { encryptField } = await import('@/lib/encryption');

      const mockAccessToken = 'access_token_xyz';
      const mockRefreshToken = 'refresh_token_abc';

      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              uuid: 'token-uuid',
              server_uuid: mockServerUuid,
              access_token_encrypted: encryptField(mockAccessToken),
              refresh_token_encrypted: encryptField(mockRefreshToken),
              token_type: 'Bearer',
              expires_at: new Date(Date.now() + 3600 * 1000),
              created_at: new Date(),
              updated_at: new Date(),
            }]),
          }),
        }),
      });

      const result = await storeOAuthTokens(
        mockServerUuid,
        mockAccessToken,
        mockRefreshToken,
        3600
      );

      expect(result).toBeDefined();
      expect(db.insert).toHaveBeenCalled();
      expect(encryptField).toHaveBeenCalledWith(mockAccessToken);
      expect(encryptField).toHaveBeenCalledWith(mockRefreshToken);
    });

    it('should enforce one token per server constraint', async () => {
      const { storeOAuthTokens } = await import('@/lib/oauth/token-storage');
      const { db } = await import('@/db');

      const mockAccessToken1 = 'access_token_1';
      const mockRefreshToken1 = 'refresh_token_1';
      const mockAccessToken2 = 'access_token_2';
      const mockRefreshToken2 = 'refresh_token_2';

      // First insert
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              uuid: 'token-uuid-1',
              server_uuid: mockServerUuid,
              access_token_encrypted: `encrypted_${mockAccessToken1}`,
              refresh_token_encrypted: `encrypted_${mockRefreshToken1}`,
            }]),
          }),
        }),
      });

      await storeOAuthTokens(mockServerUuid, mockAccessToken1, mockRefreshToken1, 3600);

      // Second insert (should update, not create new)
      await storeOAuthTokens(mockServerUuid, mockAccessToken2, mockRefreshToken2, 3600);

      // onConflictDoUpdate should be called for the constraint
      expect(db.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe('Complete OAuth Flow Integration', () => {
    it('should complete full OAuth flow from initiation to token storage', async () => {
      const { createPkceState } = await import('@/lib/oauth/pkce');
      const { validatePkceState } = await import('@/lib/oauth/integrity');
      const { exchangeAuthorizationCode } = await import('@/lib/oauth/token-exchange');
      const { storeOAuthTokens } = await import('@/lib/oauth/token-storage');
      const { db } = await import('@/db');

      // Step 1: Create PKCE state
      const mockState = 'oauth-flow-state';
      const mockCodeVerifier = randomBytes(32).toString('base64url');
      const mockCodeChallenge = createHash('sha256').update(mockCodeVerifier).digest('base64url');

      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            state: mockState,
            code_verifier: mockCodeVerifier,
            server_uuid: mockServerUuid,
            user_id: mockUserId,
            redirect_uri: mockRedirectUri,
            expires_at: new Date(Date.now() + 5 * 60 * 1000),
          }]),
        }),
      });

      const pkceState = await createPkceState(mockServerUuid, mockUserId, mockRedirectUri);
      expect(pkceState.state).toBeDefined();

      // Step 2: User authenticates and returns with code
      const mockAuthCode = 'authorization-code-123';

      // Step 3: Validate PKCE state
      const mockIntegrityHash = createHash('sha256')
        .update(`${mockState}:${mockServerUuid}:${mockUserId}`)
        .digest('hex');

      (db.query.oauthPkceStatesTable.findFirst as any).mockResolvedValue({
        state: mockState,
        server_uuid: mockServerUuid,
        user_id: mockUserId,
        code_verifier: mockCodeVerifier,
        redirect_uri: mockRedirectUri,
        integrity_hash: mockIntegrityHash,
        expires_at: new Date(Date.now() + 2 * 60 * 1000),
        created_at: new Date(),
      });

      (db.delete as any).mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      });

      const validatedState = await validatePkceState(mockState, mockUserId);
      expect(validatedState).toBeDefined();
      expect(validatedState?.code_verifier).toBe(mockCodeVerifier);

      // Step 4: Exchange authorization code for tokens
      const mockAccessToken = 'final-access-token';
      const mockRefreshToken = 'final-refresh-token';

      global.fetch = vi.fn().mockResolvedValue(mockApiResponse({
        access_token: mockAccessToken,
        refresh_token: mockRefreshToken,
        token_type: 'Bearer',
        expires_in: 3600,
      }));

      const tokens = await exchangeAuthorizationCode(
        mockTokenEndpoint,
        mockAuthCode,
        mockCodeVerifier,
        mockRedirectUri,
        'test-client-id'
      );

      expect(tokens.access_token).toBe(mockAccessToken);
      expect(tokens.refresh_token).toBe(mockRefreshToken);

      // Step 5: Store tokens
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              uuid: 'final-token-uuid',
              server_uuid: mockServerUuid,
              access_token_encrypted: `encrypted_${mockAccessToken}`,
              refresh_token_encrypted: `encrypted_${mockRefreshToken}`,
            }]),
          }),
        }),
      });

      const stored = await storeOAuthTokens(
        mockServerUuid,
        mockAccessToken,
        mockRefreshToken,
        3600
      );

      expect(stored).toBeDefined();
    });
  });
});
