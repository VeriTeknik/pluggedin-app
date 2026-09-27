/**
 * Submitting a community server through the wizard stores a "template" of it in
 * registry_servers.metadata. That template was the raw connection: the URL as
 * typed (credentials in it included), and streamableHTTPOptions with the
 * headers the user supplied — an Authorization bearer, an API key — plus the
 * OAuth configuration and session id. Every other place a server template is
 * persisted goes through sanitizeServerTemplate; this one did not.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ insertValues: vi.fn(), createMcpServer: vi.fn(), shareMcpServer: vi.fn() }));

vi.mock('@/lib/auth-helpers', () => ({
  withAuth: async (fn: (session: unknown) => unknown) => fn({ user: { id: 'owner' } }),
  withProfileAuth: async (_uuid: string, fn: (session: unknown) => unknown) => fn({ user: { id: 'owner' } }),
}));
vi.mock('@/app/actions/registry-oauth-session', () => ({ getRegistryOAuthToken: async () => null }));
vi.mock('@/app/actions/mcp-servers', () => ({ createMcpServer: m.createMcpServer }));
vi.mock('@/app/actions/social', () => ({ shareMcpServer: m.shareMcpServer }));
vi.mock('@/db', () => ({
  db: {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        m.insertValues(values);
        return { returning: async () => [{ uuid: 'registry-row', ...values }] };
      },
    }),
  },
}));

const { submitWizardToRegistry } = await import('@/app/actions/registry-servers');

const SECRET = 'Bearer sk-live-secret-token';
const URL_PASSWORD = 'hunter2';

beforeEach(() => {
  vi.clearAllMocks();
  m.createMcpServer.mockResolvedValue({ success: true, data: { uuid: '55555555-5555-4555-8555-555555555555' } });
  m.shareMcpServer.mockResolvedValue({ success: true });
});

function storedMetadata(): Record<string, any> {
  expect(m.insertValues).toHaveBeenCalledTimes(1);
  return m.insertValues.mock.calls[0][0].metadata as Record<string, any>;
}

describe('the community-server template kept in registry_servers.metadata', () => {
  it('carries no credentials from the connection', async () => {
    const result = await submitWizardToRegistry({
      githubUrl: 'https://github.com/acme/tool',
      owner: 'acme',
      repo: 'tool',
      shouldClaim: false,
      currentProfileUuid: '66666666-6666-4666-8666-666666666666',
      finalDescription: 'A tool',
      transportConfigs: {
        'streamable-http': {
          url: `https://user:${URL_PASSWORD}@mcp.example.com/mcp`,
          headers: { Authorization: SECRET, 'X-Api-Key': 'key-123' },
          sessionId: 'live-session',
          oauth: { client_secret: 'oauth-secret' },
        },
      },
    } as any);

    expect(result?.success).toBe(true);
    const serialized = JSON.stringify(storedMetadata());
    for (const secret of [SECRET, 'sk-live-secret-token', 'key-123', URL_PASSWORD, 'oauth-secret', 'live-session']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('keeps what identifies the server, its header names and its packages', async () => {
    await submitWizardToRegistry({
      githubUrl: 'https://github.com/acme/tool',
      owner: 'acme',
      repo: 'tool',
      shouldClaim: false,
      currentProfileUuid: '66666666-6666-4666-8666-666666666666',
      finalDescription: 'A tool',
      transportConfigs: {
        'streamable-http': { url: 'https://mcp.example.com/mcp', headers: { Authorization: SECRET } },
      },
    } as any);

    const metadata = storedMetadata();
    expect(metadata.name).toBe('tool');
    expect(metadata.description).toBe('A tool');
    expect(metadata.type).toBe('STREAMABLE_HTTP');
    expect(metadata.github_owner).toBe('acme');
    expect(metadata.github_repo).toBe('tool');
    expect(metadata.repository_url).toBe('https://github.com/acme/tool');
    expect(metadata.url).toBe('https://mcp.example.com/mcp');
    expect(Object.keys(metadata.streamableHTTPOptions.headers)).toEqual(['Authorization']);
    expect(Array.isArray(metadata.packages)).toBe(true);
  });
});
