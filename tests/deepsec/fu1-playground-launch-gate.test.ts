/**
 * The playground builds its own launch for each selected server and hands it to
 * langchain-mcp-tools, which spawns it.
 *
 * - When bubblewrap produced no launch (any non-Linux host) it only logged a
 *   warning and ran the server's command bare, as the application user —
 *   whereas every other launch refuses unless the operator opted out with
 *   MCP_ALLOW_UNSANDBOXED_STDIO=true.
 * - It sandboxed by *stored* type and passed every record's command on. A
 *   remote-typed record proxied through mcp-remote is a local process
 *   (resolveTransportType), so it went unsandboxed; one carrying some other
 *   command was handed to the library as a command to run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  servers: [] as unknown[],
  init: vi.fn(),
  log: vi.fn(),
  resolve: vi.fn((name: string): string | null => `/usr/bin/${name}`),
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
vi.mock('@/lib/mcp/sandbox-launcher', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mcp/sandbox-launcher')>()),
  resolveSandboxLauncher: m.resolve,
}));

const { getOrCreatePlaygroundSession } = await import('@/app/actions/mcp-playground');

const UUID = '11111111-1111-4111-8111-111111111111';
const PAYLOAD = "require('fs').writeFileSync('/tmp/pwned', 'x')";
const LLM = { provider: 'anthropic' as const, model: 'claude-test' };

const realPlatform = process.platform;
let profileCounter = 0;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  m.init.mockResolvedValue({ tools: [], cleanup: async () => undefined, failedServers: [] });
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform });
  vi.unstubAllEnvs();
  errorSpy.mockRestore();
});

/** Starts a session (each on a fresh profile) and returns the config handed to the library. */
async function launch(server: Record<string, unknown>): Promise<Record<string, any>> {
  m.servers = [{ uuid: UUID, name: 'srv', env: {}, config: null, ...server }];
  const profile = `00000000-0000-4000-8000-${String(++profileCounter).padStart(12, '0')}`;
  await getOrCreatePlaygroundSession(profile, [UUID], LLM);
  expect(m.init).toHaveBeenCalledTimes(1);
  return m.init.mock.calls[0][0] as Record<string, any>;
}

const logged = () => m.log.mock.calls.map((call) => String(call[2])).join('\n');

describe('a STDIO server off Linux (no sandbox builds)', () => {
  const stdio = { type: 'STDIO', command: 'node', args: ['-e', PAYLOAD] };

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
  });

  it('is not started', async () => {
    const config = await launch(stdio);

    expect(config).not.toHaveProperty('srv');
    expect(logged()).toMatch(/srv[\s\S]*sandbox/i);
  });

  it('is not started for any other value of the opt-out', async () => {
    vi.stubEnv('MCP_ALLOW_UNSANDBOXED_STDIO', '1');

    expect(await launch(stdio)).not.toHaveProperty('srv');
  });

  it('runs bare only under the operator opt-out, and says so loudly', async () => {
    vi.stubEnv('MCP_ALLOW_UNSANDBOXED_STDIO', 'true');

    const config = await launch(stdio);

    expect(config.srv.command).toBe('node');
    expect(errorSpy.mock.calls.flat().join(' ')).toContain('MCP_ALLOW_UNSANDBOXED_STDIO');
  });
});

describe('the launch follows the transport a record actually runs with', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
  });

  it('sandboxes a STDIO server', async () => {
    const config = await launch({ type: 'STDIO', command: 'node', args: ['server.js'] });

    expect(config.srv.command).toBe('/usr/bin/bwrap');
    expect(config.srv.transport).toBe('stdio');
  });

  it('sandboxes a remote-typed record proxied through mcp-remote, as the local process it is', async () => {
    const config = await launch({
      type: 'SSE',
      url: 'https://mcp.example.com/sse',
      command: null,
      args: ['-y', 'mcp-remote', 'https://mcp.example.com/sse'],
    });

    expect(config.srv.command).toBe('/usr/bin/bwrap');
    const separator = config.srv.args.indexOf('--');
    expect(config.srv.args.slice(separator + 1)).toEqual(['npx', '-y', 'mcp-remote', 'https://mcp.example.com/sse']);
    expect(config.srv.transport).toBe('stdio');
    // The library refuses a config with both a command and a url.
    expect(config.srv.url ?? null).toBeNull();
  });

  it('refuses a remote-typed record that names some other command beside the mcp-remote marker', async () => {
    const config = await launch({
      type: 'STREAMABLE_HTTP',
      url: 'https://mcp.example.com/mcp',
      command: 'node',
      args: ['-e', PAYLOAD, 'mcp-remote'],
    });

    expect(config).not.toHaveProperty('srv');
    expect(logged()).toMatch(/srv/);
  });

  it('passes no process fields for a plain remote record', async () => {
    const config = await launch({
      type: 'STREAMABLE_HTTP',
      url: 'https://mcp.example.com/mcp',
      command: 'node',
      args: ['-e', PAYLOAD],
    });

    expect(config.srv.url).toBe('https://mcp.example.com/mcp');
    expect(config.srv.transport).toBe('streamable_http');
    expect(config.srv.command ?? null).toBeNull();
    expect(config.srv.args ?? []).toEqual([]);
  });
});
