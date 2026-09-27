/**
 * createMcpClientAndTransport refuses to start a process without a sandbox
 * unless the operator opted out (MCP_ALLOW_UNSANDBOXED_STDIO=true). The
 * mcp-remote OAuth helper spawns `npx -y mcp-remote <url>` too, but when neither
 * sandbox builder produced a launch (any non-Linux host) it simply spawned npx
 * bare, as the application user — the policy did not reach it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  server: {} as Record<string, unknown>,
  lookup: vi.fn(),
  triggerOAuth: vi.fn(),
  bubblewrap: vi.fn(),
  firejail: vi.fn(),
  releasePort: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({ default: { lookup: (...a: unknown[]) => m.lookup(...a) } }));
vi.mock('@/db', () => {
  const chain: any = {};
  for (const method of ['select', 'from', 'leftJoin', 'innerJoin', 'where', 'update', 'set']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.limit = vi.fn(async () => [
    { server: m.server, profile: { uuid: '33333333-3333-4333-8333-333333333333' }, project: { user_id: 'owner' } },
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
  // The shared sandbox choice, reduced to "the first builder that builds".
  sandboxedStdioLaunch: (config: unknown) => m.bubblewrap(config) ?? m.firejail(config),
}));
vi.mock('@/lib/mcp/oauth-process-manager', () => ({
  OAuthProcessManager: class {
    triggerOAuth = (...a: unknown[]) => m.triggerOAuth(...a);
    cleanup = vi.fn();
  },
}));
vi.mock('@/lib/mcp/metrics', () => ({ mcpOAuthFlows: { inc: vi.fn() }, trackOAuthFlow: vi.fn() }));
vi.mock('@/lib/mcp/utils/port-allocator', () => ({
  portAllocator: { allocatePort: async () => 40123, releasePort: m.releasePort },
}));
vi.mock('@/lib/mcp/oauth/OAuthStateManager', () => ({ oauthStateManager: {} }));

const { triggerMcpOAuth } = await import('@/app/actions/trigger-mcp-oauth');

const SERVER_UUID = '44444444-4444-4444-8444-444444444444';
const REMOTE = 'https://mcp.example.com/sse';

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  m.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  m.triggerOAuth.mockResolvedValue({ success: false, error: 'stopped by test' });
  // What both builders return off Linux.
  m.bubblewrap.mockReturnValue(null);
  m.firejail.mockReturnValue(null);
  m.server = {
    uuid: SERVER_UUID,
    name: 'remote',
    type: 'STDIO',
    command: 'npx',
    args: ['-y', 'mcp-remote', REMOTE],
    env: {},
    config: null,
    profile_uuid: '33333333-3333-4333-8333-333333333333',
  };
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  errorSpy.mockRestore();
});

describe('mcp-remote OAuth without a sandbox', () => {
  it('refuses to spawn when no sandbox builds, and says why', async () => {
    const result = await triggerMcpOAuth(SERVER_UUID);

    expect(result.success).toBe(false);
    expect(m.triggerOAuth).not.toHaveBeenCalled();
    expect(String((result as { error?: string }).error)).toMatch(/sandbox/i);
  });

  it('gives the allocated callback port back when it refuses', async () => {
    await triggerMcpOAuth(SERVER_UUID);

    expect(m.releasePort).toHaveBeenCalledWith(40123);
  });

  it('does not treat any other value as the opt-out', async () => {
    vi.stubEnv('MCP_ALLOW_UNSANDBOXED_STDIO', '1');

    await triggerMcpOAuth(SERVER_UUID);

    expect(m.triggerOAuth).not.toHaveBeenCalled();
  });

  it('spawns the plain command only under the operator opt-out, and says so loudly', async () => {
    vi.stubEnv('MCP_ALLOW_UNSANDBOXED_STDIO', 'true');

    await triggerMcpOAuth(SERVER_UUID);

    expect(m.triggerOAuth).toHaveBeenCalledTimes(1);
    expect((m.triggerOAuth.mock.calls[0][0] as { command: string }).command).toBe('npx');
    expect(errorSpy.mock.calls.flat().join(' ')).toContain('MCP_ALLOW_UNSANDBOXED_STDIO');
  });

  it('uses the sandbox whenever one builds', async () => {
    m.firejail.mockImplementation((config: any) => ({
      command: '/usr/bin/firejail',
      args: ['--quiet', config.command, ...config.args],
      env: {},
    }));

    await triggerMcpOAuth(SERVER_UUID);

    expect(m.triggerOAuth).toHaveBeenCalledTimes(1);
    expect((m.triggerOAuth.mock.calls[0][0] as { command: string }).command).toBe('/usr/bin/firejail');
  });
});
