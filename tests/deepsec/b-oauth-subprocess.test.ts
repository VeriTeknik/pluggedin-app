import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The mcp-remote OAuth flow spawns `npx -y mcp-remote <url>` (under bwrap or
 * firejail when available) with the server's stored environment.
 *
 * - That environment reaches spawn() for the *launcher*: LD_PRELOAD and friends
 *   load into bwrap itself, on the host, before any namespace exists.
 * - The url is checked as text only. A hostname whose A record is 127.0.0.1 or
 *   a cluster address passes, and the child - which shares the host network -
 *   connects there.
 */
const m = vi.hoisted(() => ({
  server: {} as Record<string, unknown>,
  lookup: vi.fn(),
  triggerOAuth: vi.fn(),
  bubblewrap: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({ default: { lookup: (...a: unknown[]) => m.lookup(...a) } }));

vi.mock('@/db', () => {
  const chain: any = {};
  for (const method of ['select', 'from', 'leftJoin', 'innerJoin', 'where', 'update', 'set']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.limit = vi.fn(async () => [
    {
      server: m.server,
      profile: { uuid: '33333333-3333-4333-8333-333333333333' },
      project: { user_id: 'owner' },
    },
  ]);
  chain.then = undefined;
  return { db: chain };
});

vi.mock('@/lib/auth-helpers', () => ({
  withServerAuth: async (_uuid: string, fn: (session: unknown, server: unknown) => unknown) =>
    fn({ user: { id: 'owner' } }, m.server),
}));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => ({ user: { id: 'owner' } }) }));
vi.mock('@/lib/encryption', () => ({
  decryptServerData: async (row: Record<string, unknown>) => row,
  encryptField: (value: unknown) => JSON.stringify(value),
}));
vi.mock('@/lib/mcp/client-wrapper', () => ({
  // Shaped like the real builders behind the shared sandbox choice: they
  // merge serverConfig.env into the env they hand back for the launcher.
  sandboxedStdioLaunch: (...a: unknown[]) => m.bubblewrap(...a),
}));
vi.mock('@/lib/mcp/oauth-process-manager', () => ({
  OAuthProcessManager: class {
    triggerOAuth = (...a: unknown[]) => m.triggerOAuth(...a);
    cleanup = vi.fn();
  },
}));
vi.mock('@/lib/mcp/metrics', () => ({
  mcpOAuthFlows: { inc: vi.fn() },
  trackOAuthFlow: vi.fn(),
}));
vi.mock('@/lib/mcp/utils/port-allocator', () => ({
  portAllocator: { allocatePort: async () => 40123, releasePort: vi.fn() },
}));
vi.mock('@/lib/mcp/oauth/OAuthStateManager', () => ({ oauthStateManager: {} }));

const { triggerMcpOAuth } = await import('@/app/actions/trigger-mcp-oauth');
const { triggerMcpServerOAuth } = await import('@/app/actions/mcp-oauth');

const SERVER_UUID = '44444444-4444-4444-8444-444444444444';

function mcpRemoteServer(url: string, env: Record<string, string> = {}) {
  return {
    uuid: SERVER_UUID,
    name: 'remote',
    type: 'STDIO',
    command: 'npx',
    args: ['-y', 'mcp-remote', url],
    env,
    config: null,
    profile_uuid: '33333333-3333-4333-8333-333333333333',
  };
}

const PUBLIC = [{ address: '93.184.216.34', family: 4 }];

beforeEach(() => {
  vi.clearAllMocks();
  m.lookup.mockResolvedValue(PUBLIC);
  m.triggerOAuth.mockResolvedValue({ success: false, error: 'stopped by test' });
  m.bubblewrap.mockImplementation((config: any) => ({
    command: 'bwrap',
    args: ['--unshare-all', '--', config.command, ...config.args],
    env: { PATH: '/usr/bin', HOME: '/sandbox/home', ...(config.env || {}) },
  }));
});

const LOADER_AND_TRUST_ENV = {
  LD_PRELOAD: '/var/mcp-packages/servers/x/workspace/evil.so',
  LD_AUDIT: '/var/mcp-packages/servers/x/workspace/evil.so',
  DYLD_INSERT_LIBRARIES: '/tmp/evil.dylib',
  NODE_OPTIONS: '--require=/tmp/evil.js',
  PYTHONSTARTUP: '/tmp/evil.py',
  NODE_TLS_REJECT_UNAUTHORIZED: '0',
  HTTPS_PROXY: 'http://10.0.0.5:3128',
  npm_config_script_shell: '/tmp/evil.sh',
};

describe('mcp-remote OAuth: the launcher environment', () => {
  it('never hands loader, interpreter or TLS-trust variables to the process it spawns', async () => {
    m.server = mcpRemoteServer('https://mcp.example.com/sse', {
      ...LOADER_AND_TRUST_ENV,
      API_TOKEN: 'kept',
    });

    await triggerMcpOAuth(SERVER_UUID);

    expect(m.triggerOAuth).toHaveBeenCalledTimes(1);
    const { env } = m.triggerOAuth.mock.calls[0][0] as { env: Record<string, string> };
    for (const key of Object.keys(LOADER_AND_TRUST_ENV)) {
      expect(env, key).not.toHaveProperty(key);
    }
    expect(env.API_TOKEN).toBe('kept');

    // The sandbox builder is not handed them either.
    const built = m.bubblewrap.mock.calls[0][0] as { env: Record<string, string> };
    for (const key of Object.keys(LOADER_AND_TRUST_ENV)) {
      expect(built.env, key).not.toHaveProperty(key);
    }
  });
});

describe('mcp-remote OAuth: where the child is allowed to connect', () => {
  it.each([
    ['loopback', [{ address: '127.0.0.1', family: 4 }]],
    ['a cluster address', [{ address: '10.96.0.10', family: 4 }]],
    ['cloud metadata', [{ address: '169.254.169.254', family: 4 }]],
    ['a mixed answer', [...PUBLIC, { address: '192.168.1.10', family: 4 }]],
    ['IPv6 loopback', [{ address: '::1', family: 6 }]],
  ])('refuses a hostname that resolves to %s, before spawning', async (_label, answer) => {
    m.lookup.mockResolvedValue(answer);
    m.server = mcpRemoteServer('https://internal.attacker.example/sse');

    const result = await triggerMcpOAuth(SERVER_UUID);

    expect(result.success).toBe(false);
    expect(m.triggerOAuth).not.toHaveBeenCalled();
    expect(m.lookup).toHaveBeenCalledWith('internal.attacker.example', { all: true });
  });

  it('refuses a hostname that does not resolve', async () => {
    m.lookup.mockRejectedValue(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
    m.server = mcpRemoteServer('https://nowhere.example/sse');

    expect((await triggerMcpOAuth(SERVER_UUID)).success).toBe(false);
    expect(m.triggerOAuth).not.toHaveBeenCalled();
  });

  it('still starts the flow for a public host', async () => {
    m.server = mcpRemoteServer('https://mcp.example.com/sse');

    await triggerMcpOAuth(SERVER_UUID);

    expect(m.triggerOAuth).toHaveBeenCalledTimes(1);
  });

  it('applies through the mcp-oauth entry point too', async () => {
    m.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    m.server = mcpRemoteServer('https://internal.attacker.example/sse');

    const result = await triggerMcpServerOAuth(SERVER_UUID);

    expect(result.success).toBe(false);
    expect(m.triggerOAuth).not.toHaveBeenCalled();
  });
});
