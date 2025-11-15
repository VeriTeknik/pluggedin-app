import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies
const mockUpdate = vi.fn(() => ({
  set: vi.fn(() => ({
    where: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve([{
        uuid: 'token-uuid',
        server_uuid: 'test-server-uuid',
        access_token_encrypted: 'old-token',
        refresh_token_encrypted: 'refresh-token',
        expires_at: new Date(Date.now() - 1000), // Expired
        refresh_token_locked_at: new Date(),
        refresh_token_used_at: null,
      }])),
    })),
  })),
}));

const mockSelect = vi.fn(() => ({
  from: vi.fn(() => ({
    innerJoin: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([{
            user_id: 'test-user-id',
            server_uuid: 'test-server-uuid',
          }])),
        })),
      })),
    })),
  })),
}));

vi.mock('@/db', () => ({
  db: {
    query: {
      mcpServerOAuthTokensTable: {
        findFirst: vi.fn(),
      },
      mcpServersTable: {
        findFirst: vi.fn(),
      },
    },
    update: mockUpdate,
    select: mockSelect,
  },
}));

vi.mock('@/lib/encryption', () => ({
  decryptField: vi.fn((encrypted) => {
    if (encrypted === 'encrypted-options') {
      return {
        headers: {
          'X-Custom-Header': 'value',
        },
      };
    }
    return {};
  }),
  encryptField: vi.fn((data) => `encrypted-${JSON.stringify(data)}`),
}));

vi.mock('@/lib/security/validators', () => ({
  validateHeaders: vi.fn((headers) => ({
    valid: true,
    sanitizedHeaders: headers,
  })),
}));

vi.mock('@/lib/oauth/oauth-config-store', () => ({
  getOAuthConfig: vi.fn(() => Promise.resolve({
    authorization_endpoint: 'https://oauth.example.com/authorize',
    token_endpoint: 'https://oauth.example.com/token',
    client_id: 'test-client-id',
    client_secret_encrypted: 'test-client-secret',
  })),
}));

vi.mock('@/lib/observability/logger', () => ({
  log: {
    oauth: vi.fn(),
    security: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/observability/oauth-metrics', () => ({
  recordTokenRefresh: vi.fn(),
  recordTokenReuseDetected: vi.fn(),
  recordTokenRevocation: vi.fn(),
}));

describe('OAuth Token Format Compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should store OAuth token in both new and legacy formats', async () => {
    const { db } = await import('@/db');
    const { encryptField } = await import('@/lib/encryption');
    const { getOAuthConfig } = await import('@/lib/oauth/oauth-config-store');

    // Reset mocks
    vi.clearAllMocks();

    // Mock server with existing streamableHTTPOptions
    db.query.mcpServersTable.findFirst = vi.fn(() => Promise.resolve({
      uuid: 'test-server-uuid',
      streamable_http_options_encrypted: 'encrypted-options',
    }));

    // Mock OAuth tokens table
    db.query.mcpServerOAuthTokensTable.findFirst = vi.fn(() => Promise.resolve({
      uuid: 'token-uuid',
      server_uuid: 'test-server-uuid',
      access_token_encrypted: 'old-token',
      refresh_token_encrypted: 'refresh-token',
      expires_at: new Date(Date.now() - 1000), // Expired
      refresh_token_locked_at: null,
    }));

    // Mock OAuth token response
    const newTokens = {
      access_token: 'new-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
    };

    // Mock token fetch
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(newTokens),
    })) as any;

    // Import and call the refresh function
    const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');

    await refreshOAuthToken('test-server-uuid', 'test-user-id');

    // Verify encryptField was called with data containing both formats
    expect(encryptField).toHaveBeenCalled();

    const encryptedData = encryptField.mock.calls.find(call =>
      call[0]?.requestInit?.headers?.Authorization
    )?.[0];

    expect(encryptedData).toBeDefined();

    // Should have both formats
    expect(encryptedData.requestInit?.headers?.Authorization).toBe('Bearer new-access-token');
    expect(encryptedData.headers?.Authorization).toBe('Bearer new-access-token');
  });

  it('should validate headers before storing OAuth token', async () => {
    const { validateHeaders } = await import('@/lib/security/validators');
    const { db } = await import('@/db');
    const { decryptField } = await import('@/lib/encryption');

    // Reset mocks
    vi.clearAllMocks();

    // Mock OAuth tokens table
    db.query.mcpServerOAuthTokensTable.findFirst = vi.fn(() => Promise.resolve({
      uuid: 'token-uuid',
      server_uuid: 'test-server-uuid',
      access_token_encrypted: 'old-token',
      refresh_token_encrypted: 'refresh-token',
      expires_at: new Date(Date.now() - 1000),
      refresh_token_locked_at: null,
    }));

    // Mock server with malicious headers in streamableHTTPOptions
    db.query.mcpServersTable.findFirst = vi.fn(() => Promise.resolve({
      uuid: 'test-server-uuid',
      streamable_http_options_encrypted: 'encrypted-malicious-options',
    }));

    // Mock decryptField to return malicious headers
    (decryptField as any).mockImplementation((encrypted: string) => {
      if (encrypted === 'encrypted-malicious-options') {
        return {
          requestInit: {
            headers: {
              'X-Malicious-Header': 'value',
            },
          },
        };
      }
      return {};
    });

    // Mock validateHeaders to fail for malicious headers
    (validateHeaders as any).mockImplementation((headers: any) => {
      if (headers['X-Malicious-Header']) {
        return {
          valid: false,
          error: 'Invalid header: X-Malicious-Header',
        };
      }
      return { valid: true, sanitizedHeaders: headers };
    });

    // Mock token fetch
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'token',
        token_type: 'Bearer',
      }),
    })) as any;

    const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');
    const { log } = await import('@/lib/observability/logger');

    // Function should return false (error is caught internally) due to invalid headers
    const result = await refreshOAuthToken('test-server-uuid', 'test-user-id');

    // Verify the function returned false due to validation error
    expect(result).toBe(false);

    // Verify validateHeaders was called
    expect(validateHeaders).toHaveBeenCalled();

    // Verify error was logged
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('OAuth Refresh'),
      expect.any(Error),
      expect.objectContaining({ serverUuid: 'test-server-uuid' })
    );
  });

  it('should sanitize headers when validation passes', async () => {
    const { validateHeaders } = await import('@/lib/security/validators');
    const { encryptField } = await import('@/lib/encryption');
    const { db } = await import('@/db');
    const { decryptField } = await import('@/lib/encryption');

    // Reset mocks
    vi.clearAllMocks();

    // Mock OAuth tokens table
    db.query.mcpServerOAuthTokensTable.findFirst = vi.fn(() => Promise.resolve({
      uuid: 'token-uuid',
      server_uuid: 'test-server-uuid',
      access_token_encrypted: 'old-token',
      refresh_token_encrypted: 'refresh-token',
      expires_at: new Date(Date.now() - 1000),
      refresh_token_locked_at: null,
    }));

    // Mock server with headers
    db.query.mcpServersTable.findFirst = vi.fn(() => Promise.resolve({
      uuid: 'test-server-uuid',
      streamable_http_options_encrypted: 'encrypted-options',
    }));

    // Mock decryptField to return headers that need sanitization
    (decryptField as any).mockImplementation((encrypted: string) => {
      if (encrypted === 'encrypted-options') {
        return {
          requestInit: {
            headers: {
              'X-Needs-Sanitization': 'raw-value',
            },
          },
        };
      }
      return {};
    });

    // Mock validateHeaders to pass with sanitized headers
    (validateHeaders as any).mockImplementation((headers: any) => ({
      valid: true,
      sanitizedHeaders: {
        'X-Safe-Header': 'sanitized-value',
      },
    }));

    // Mock token fetch
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'new-token',
        token_type: 'Bearer',
      }),
    })) as any;

    const { refreshOAuthToken } = await import('@/lib/oauth/token-refresh-service');

    await refreshOAuthToken('test-server-uuid', 'test-user-id');

    // Verify sanitized headers are used
    expect(encryptField).toHaveBeenCalled();
    const encryptedData = encryptField.mock.calls.find(call =>
      call[0]?.requestInit?.headers?.Authorization
    )?.[0];

    expect(encryptedData).toBeDefined();
    expect(encryptedData.requestInit.headers).toHaveProperty('X-Safe-Header');
    expect(encryptedData.requestInit.headers['X-Safe-Header']).toBe('sanitized-value');
    expect(encryptedData.requestInit.headers['Authorization']).toContain('Bearer');
  });
});
