import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMcpServerOAuthStatus } from '@/app/actions/mcp-oauth';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(() => Promise.resolve({ user: { id: 'test-user-id' } })),
}));

vi.mock('@/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([
                {
                  server: {
                    uuid: 'test-server-uuid',
                    name: 'test-server',
                    url: 'https://api.example.com',
                    streamable_http_options_encrypted: null,
                    config: {},
                  },
                  profile: { uuid: 'profile-uuid' },
                  project: { user_id: 'test-user-id' },
                },
              ])),
            })),
          })),
        })),
      })),
    })),
    query: {
      mcpServerOAuthTokensTable: {
        findFirst: vi.fn(),
      },
      mcpServerOAuthConfigTable: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('@/lib/mcp/oauth/OAuthStateManager', () => ({
  oauthStateManager: {
    getActiveSessionsForServer: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock('@/lib/encryption', () => ({
  decryptServerData: vi.fn((data) => {
    if (data.streamable_http_options_encrypted) {
      return {
        streamableHTTPOptions: {
          headers: {
            Authorization: 'Bearer test-token',
          },
        },
      };
    }
    return data;
  }),
}));

describe('OAuth Detection - API Key vs OAuth Differentiation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should NOT mark server as OAuth if only Authorization header exists (API key case)', async () => {
    const { db } = await import('@/db');

    // Mock: Server has Authorization header but NO OAuth config
    db.query.mcpServerOAuthTokensTable.findFirst = vi.fn(() => Promise.resolve(null));
    db.query.mcpServerOAuthConfigTable.findFirst = vi.fn(() => Promise.resolve(null));

    // Mock server with Authorization header in streamableHTTPOptions
    db.select = vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([
                {
                  server: {
                    uuid: 'context7-server-uuid',
                    name: 'context7',
                    url: 'https://api.context7.com',
                    streamable_http_options_encrypted: 'encrypted-data-with-api-key',
                    config: {},
                  },
                  profile: { uuid: 'profile-uuid' },
                  project: { user_id: 'test-user-id' },
                },
              ])),
            })),
          })),
        })),
      })),
    }));

    const result = await getMcpServerOAuthStatus('context7-server-uuid');

    expect(result.success).toBe(true);
    expect(result.data?.isAuthenticated).toBe(false); // Should NOT be marked as OAuth
  });

  it('should mark server as OAuth if OAuth config exists', async () => {
    const { db } = await import('@/db');

    // Mock: Server has OAuth config
    db.query.mcpServerOAuthConfigTable.findFirst = vi.fn(() => Promise.resolve({
      uuid: 'oauth-config-uuid',
      server_uuid: 'notion-server-uuid',
      authorization_endpoint: 'https://api.notion.com/oauth/authorize',
      token_endpoint: 'https://api.notion.com/oauth/token',
    }));

    // Mock server with Authorization header
    db.select = vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          leftJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([
                {
                  server: {
                    uuid: 'notion-server-uuid',
                    name: 'notion',
                    url: 'https://api.notion.com',
                    streamable_http_options_encrypted: 'encrypted-oauth-token',
                    config: {},
                  },
                  profile: { uuid: 'profile-uuid' },
                  project: { user_id: 'test-user-id' },
                },
              ])),
            })),
          })),
        })),
      })),
    }));

    const result = await getMcpServerOAuthStatus('notion-server-uuid');

    expect(result.success).toBe(true);
    expect(result.data?.isAuthenticated).toBe(true); // Should be marked as OAuth
  });

  it('should mark server as OAuth if OAuth tokens exist', async () => {
    const { db } = await import('@/db');

    // Mock: Server has OAuth tokens
    db.query.mcpServerOAuthTokensTable.findFirst = vi.fn(() => Promise.resolve({
      uuid: 'token-uuid',
      server_uuid: 'notion-server-uuid',
      access_token_encrypted: 'encrypted-access-token',
      created_at: new Date(),
      updated_at: new Date(),
    }));

    const result = await getMcpServerOAuthStatus('notion-server-uuid');

    expect(result.success).toBe(true);
    expect(result.data?.isAuthenticated).toBe(true);
    expect(result.data?.lastAuthenticated).toBeDefined();
  });
});
