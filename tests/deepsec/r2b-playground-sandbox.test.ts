// @vitest-environment node
/**
 * The playground builds its own launch for each selected STDIO server.
 *
 * - It always asked bubblewrap, whatever MCP_ISOLATION_TYPE and
 *   MCP_ISOLATION_FALLBACK said and whether bwrap was installed, so on a host
 *   with only firejail every STDIO server failed to start, and a host with
 *   isolation configured off still got bwrap. Connections made through
 *   client-wrapper follow that policy; the playground now uses the same one.
 * - A builder that threw for one server (its directory is a symlink out of
 *   itself, or cannot be created) threw out of the loop and failed the whole
 *   session. That server is now refused on its own, with the reason logged.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  servers: [] as unknown[],
  init: vi.fn(),
  log: vi.fn(),
  installed: new Set<string>(),
}));

vi.mock('@/db', () => ({ db: {} }));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => ({ user: { id: 'owner' } }) }));
vi.mock('@/lib/auth-helpers', () => ({
  withProfileAuth: async (uuid: string, fn: (session: unknown, profile: unknown) => unknown) =>
    fn({ user: { id: 'owner' } }, { uuid }),
}));
vi.mock('@/app/actions/mcp-servers', () => ({ getMcpServers: async () => m.servers }));
vi.mock('@/app/actions/log-retention', () => ({ ensureLogDirectories: async () => undefined }));
vi.mock('@/app/actions/mcp-server-logger', () => ({
  createEnhancedMcpLogger: async () => ({ cleanup: async () => undefined }),
}));
vi.mock('@/app/actions/audit-logger', () => ({ logAuditEvent: async () => undefined }));
vi.mock('@/app/actions/playground-settings', () => ({ getPlaygroundSettings: async () => ({ success: false }) }));
vi.mock('@/lib/mcp/server-logs', () => ({
  addServerLog: (...a: unknown[]) => m.log(...a),
  clearPartialServerLog: vi.fn(),
  clearServerLogsFor: vi.fn(),
  readPartialServerLog: vi.fn(),
  readServerLogs: vi.fn(),
  setPartialServerLog: vi.fn(),
}));
vi.mock('@/lib/mcp/progressive-initialization', () => ({
  progressivelyInitializeMcpServers: (...a: unknown[]) => m.init(...a),
}));
vi.mock('@langchain/anthropic', () => ({ ChatAnthropic: class {} }));
vi.mock('@langchain/langgraph/prebuilt', () => ({ createReactAgent: () => ({}) }));
// Which launchers "are installed" is up to each test.
vi.mock('@/lib/mcp/sandbox-launcher', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mcp/sandbox-launcher')>()),
  resolveSandboxLauncher: (name: string) => (m.installed.has(name) ? `/usr/bin/${name}` : null),
}));

const GOOD = '11111111-1111-4111-8111-111111111111';
const BROKEN = '22222222-2222-4222-8222-222222222222';
const ELSEWHERE = '33333333-3333-4333-8333-333333333333';
const LLM = { provider: 'anthropic' as const, model: 'claude-test' };

const realPlatform = process.platform;
let store: string;
let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  m.installed = new Set(['bwrap', 'firejail']);
  m.init.mockResolvedValue({ tools: [], cleanup: async () => undefined, failedServers: [] });
  store = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'r2b-playground-')));
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

const stdio = (uuid: string, name: string) => ({
  uuid,
  name,
  type: 'STDIO',
  command: 'node',
  args: ['server.js'],
  env: {},
  config: null,
});

/** Loads the playground under `env` (the isolation settings are read at load) and starts a session. */
async function launch(servers: unknown[], env: Record<string, string> = {}) {
  vi.stubEnv('MCP_PACKAGE_STORE_DIR', store);
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  const { getOrCreatePlaygroundSession } = await import('@/app/actions/mcp-playground');

  m.servers = servers;
  const result = await getOrCreatePlaygroundSession(
    '00000000-0000-4000-8000-000000000001',
    servers.map((server) => (server as { uuid: string }).uuid),
    LLM
  );
  return { result, config: (m.init.mock.calls[0]?.[0] ?? null) as Record<string, any> | null };
}

const logged = () => m.log.mock.calls.map((call) => String(call[2])).join('\n');

describe('the playground chooses a sandbox the way every other launch does', () => {
  it('uses bubblewrap by default when it is installed', async () => {
    const { config } = await launch([stdio(GOOD, 'srv')]);
    expect(config!.srv.command).toBe('/usr/bin/bwrap');
  });

  it('uses firejail on a host where only firejail is installed', async () => {
    m.installed = new Set(['firejail']);

    const { config } = await launch([stdio(GOOD, 'srv')]);

    expect(config!.srv.command).toBe('/usr/bin/firejail');
  });

  it('follows MCP_ISOLATION_TYPE', async () => {
    const { config } = await launch([stdio(GOOD, 'srv')], { MCP_ISOLATION_TYPE: 'firejail' });
    expect(config!.srv.command).toBe('/usr/bin/firejail');
  });

  it('refuses the server when isolation is configured off and the operator has not opted out', async () => {
    const { config } = await launch([stdio(GOOD, 'srv')], { MCP_ISOLATION_TYPE: 'none' });

    expect(config).not.toHaveProperty('srv');
    expect(logged()).toMatch(/srv[\s\S]*sandbox/i);
  });

  it('refuses the server when no launcher is installed', async () => {
    m.installed = new Set();

    const { config } = await launch([stdio(GOOD, 'srv')]);

    expect(config).not.toHaveProperty('srv');
  });
});

describe('a server whose sandbox cannot be prepared', () => {
  beforeEach(() => {
    // Its workspace is a symlink out of its own directory, which the builders
    // refuse by throwing.
    fs.mkdirSync(path.join(store, 'servers', ELSEWHERE, 'workspace'), { recursive: true });
    fs.mkdirSync(path.join(store, 'servers', BROKEN), { recursive: true });
    fs.symlinkSync(path.join(store, 'servers', ELSEWHERE, 'workspace'), path.join(store, 'servers', BROKEN, 'workspace'));
  });

  it('is refused on its own, and the session starts with the others', async () => {
    const { result, config } = await launch([stdio(BROKEN, 'broken'), stdio(GOOD, 'good')]);

    expect(result).toMatchObject({ success: true });
    expect(config).not.toHaveProperty('broken');
    expect(config!.good.command).toBe('/usr/bin/bwrap');
    expect(logged()).toMatch(/broken[\s\S]*escapes base directory/);
  });
});
