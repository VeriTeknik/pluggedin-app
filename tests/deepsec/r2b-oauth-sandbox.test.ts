// @vitest-environment node
/**
 * The mcp-remote OAuth helper builds its own sandboxed launch.
 *
 * - It always preferred bubblewrap, whatever MCP_ISOLATION_TYPE and
 *   MCP_ISOLATION_FALLBACK said and whether bwrap was installed, so a host
 *   with only firejail could never complete an mcp-remote OAuth flow. It now
 *   uses the policy client-wrapper applies to every other launch.
 * - When a builder threw (a server directory that is a symlink out of itself,
 *   or one that cannot be created), the callback port it had just allocated
 *   was never given back.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  server: {} as Record<string, unknown>,
  lookup: vi.fn(),
  triggerOAuth: vi.fn(),
  releasePort: vi.fn(),
  installed: new Set<string>(),
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
vi.mock('@/lib/mcp/oauth-process-manager', () => ({
  OAuthProcessManager: class {
    triggerOAuth = (...a: unknown[]) => m.triggerOAuth(...a);
    cleanup = vi.fn();
  },
}));
vi.mock('@/lib/mcp/metrics', () => ({ mcpOAuthFlows: { inc: vi.fn() }, trackOAuthFlow: vi.fn() }));
vi.mock('@/lib/mcp/utils/port-allocator', () => ({
  portAllocator: { allocatePort: async () => 40123, releasePort: (...a: unknown[]) => m.releasePort(...a) },
}));
vi.mock('@/lib/mcp/oauth/OAuthStateManager', () => ({ oauthStateManager: {} }));
// Which launchers "are installed" is up to each test.
vi.mock('@/lib/mcp/sandbox-launcher', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mcp/sandbox-launcher')>()),
  resolveSandboxLauncher: (name: string) => (m.installed.has(name) ? `/usr/bin/${name}` : null),
}));

const SERVER_UUID = '44444444-4444-4444-8444-444444444444';
const ELSEWHERE = '55555555-5555-4555-8555-555555555555';
const REMOTE = 'https://mcp.example.com/sse';

const realPlatform = process.platform;
let store: string;
let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  m.installed = new Set(['bwrap', 'firejail']);
  m.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  m.triggerOAuth.mockResolvedValue({ success: false, error: 'stopped by test' });
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
  store = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r2b-oauth-')));
  Object.defineProperty(process, 'platform', { value: 'linux' });
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform });
  vi.unstubAllEnvs();
  errorSpy.mockRestore();
  logSpy.mockRestore();
  fs.rmSync(store, { recursive: true, force: true });
});

/** Loads the action under `env` (the isolation settings are read at load) and runs it. */
async function trigger(env: Record<string, string> = {}) {
  vi.stubEnv('MCP_PACKAGE_STORE_DIR', store);
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  const { triggerMcpOAuth } = await import('@/app/actions/trigger-mcp-oauth');
  return triggerMcpOAuth(SERVER_UUID) as Promise<{ success: boolean; error?: string }>;
}

const spawnedCommand = () => (m.triggerOAuth.mock.calls[0][0] as { command: string }).command;

describe('mcp-remote OAuth chooses a sandbox the way every other launch does', () => {
  it('uses bubblewrap by default when it is installed', async () => {
    await trigger();
    expect(spawnedCommand()).toBe('/usr/bin/bwrap');
  });

  it('uses firejail on a host where only firejail is installed', async () => {
    m.installed = new Set(['firejail']);

    await trigger();

    expect(spawnedCommand()).toBe('/usr/bin/firejail');
  });

  it('follows MCP_ISOLATION_TYPE', async () => {
    await trigger({ MCP_ISOLATION_TYPE: 'firejail' });
    expect(spawnedCommand()).toBe('/usr/bin/firejail');
  });

  it('refuses, and gives the port back, when isolation is configured off', async () => {
    const result = await trigger({ MCP_ISOLATION_TYPE: 'none' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/sandbox/i);
    expect(m.triggerOAuth).not.toHaveBeenCalled();
    expect(m.releasePort).toHaveBeenCalledWith(40123);
  });
});

describe('mcp-remote OAuth when the sandbox cannot be prepared', () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(store, 'servers', ELSEWHERE, 'workspace'), { recursive: true });
    fs.mkdirSync(path.join(store, 'servers', SERVER_UUID), { recursive: true });
    fs.symlinkSync(
      path.join(store, 'servers', ELSEWHERE, 'workspace'),
      path.join(store, 'servers', SERVER_UUID, 'workspace')
    );
  });

  it('fails without spawning and gives the allocated callback port back', async () => {
    const result = await trigger();

    expect(result.success).toBe(false);
    expect(m.triggerOAuth).not.toHaveBeenCalled();
    expect(m.releasePort).toHaveBeenCalledWith(40123);
  });

  it('gives the port back whatever OAUTH_USE_LEGACY_PORTS is set to, when it was allocated dynamically', async () => {
    const result = await trigger({ OAUTH_USE_LEGACY_PORTS: 'false' });

    expect(result.success).toBe(false);
    expect(m.releasePort).toHaveBeenCalledWith(40123);
  });
});
