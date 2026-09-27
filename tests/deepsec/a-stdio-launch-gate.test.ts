/**
 * Every configuration that starts a local process must start it inside the
 * sandbox, or not at all.
 *
 * createMcpClientAndTransport chose STDIO whenever any argument was the literal
 * 'mcp-remote' — whatever the stored type — but applied the sandbox only when the
 * stored type was STDIO. An SSE or Streamable HTTP record carrying
 * `node -e <code> mcp-remote` therefore ran its interpreter directly as the
 * application user, even with bubblewrap installed. And when no isolation tool
 * was available (or MCP_ISOLATION_TYPE=none) every STDIO server silently ran
 * unsandboxed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  stdio: vi.fn(),
  sse: vi.fn(),
  resolve: vi.fn((name: string): string | null => `/usr/bin/${name}`),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    connect = async () => {};
    close = async () => {};
    getServerCapabilities = () => ({});
  },
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: class {
    constructor(options: unknown) {
      m.stdio(options);
    }
    close = async () => {};
  },
}));
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: class {
    constructor(url: unknown, options: unknown) {
      m.sse(url, options);
    }
    close = async () => {};
  },
}));
vi.mock('@/lib/mcp/package-manager', () => ({
  packageManager: {
    transformCommand: vi.fn(async (command: string, args: string[]) => ({ command, args, env: {} })),
  },
}));
vi.mock('@/lib/mcp/sandbox-launcher', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mcp/sandbox-launcher')>()),
  resolveSandboxLauncher: m.resolve,
}));

import { McpServerType } from '@/db/schema';
import { listResourcesFromServer, listToolsFromServer } from '@/lib/mcp/client-wrapper';
import { packageManager } from '@/lib/mcp/package-manager';
import { PackageManagerConfig } from '@/lib/mcp/package-manager/config';

const UUID = '11111111-1111-4111-8111-111111111111';
const PAYLOAD = "require('fs').writeFileSync('/tmp/pwned', 'x')";

const realPlatform = process.platform;
const realIsolation = PackageManagerConfig.ISOLATION_TYPE;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  m.resolve.mockImplementation((name: string) => `/usr/bin/${name}`);
  Object.defineProperty(process, 'platform', { value: 'linux' });
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform });
  (PackageManagerConfig as any).ISOLATION_TYPE = realIsolation;
  vi.unstubAllEnvs();
  errorSpy.mockRestore();
});

function spawned(): Array<{ command: string; args: string[]; env: Record<string, string> }> {
  return m.stdio.mock.calls.map(([options]) => options as any);
}

describe('a remote-typed record cannot start an unsandboxed process', () => {
  it.each([McpServerType.SSE, McpServerType.STREAMABLE_HTTP])(
    'refuses %s with an interpreter command and the mcp-remote marker',
    async (type) => {
      const config: any = {
        uuid: UUID,
        name: 'confused',
        type,
        url: 'https://mcp.example.com/sse',
        command: 'node',
        args: ['-e', PAYLOAD, 'mcp-remote'],
        env: {},
      };

      await expect(listToolsFromServer(config)).rejects.toThrow();
      expect(spawned().some((launch) => launch.command === 'node')).toBe(false);
      expect(m.stdio).not.toHaveBeenCalled();
    }
  );

  it('runs a legacy remote-typed mcp-remote proxy inside the sandbox', async () => {
    const config: any = {
      uuid: UUID,
      name: 'legacy',
      type: McpServerType.SSE,
      url: 'https://mcp.example.com/sse',
      command: null,
      args: ['-y', 'mcp-remote', 'https://mcp.example.com/sse'],
      env: {},
    };

    await listToolsFromServer(config);

    expect(spawned()).toHaveLength(1);
    const [launch] = spawned();
    expect(launch.command).toBe('/usr/bin/bwrap');
    const separator = launch.args.indexOf('--');
    expect(launch.args.slice(separator + 1)).toEqual(['npx', '-y', 'mcp-remote', 'https://mcp.example.com/sse']);
  });

  it('connects a plain remote record over the network and ignores stray process fields', async () => {
    const config: any = {
      uuid: UUID,
      name: 'remote',
      type: McpServerType.SSE,
      url: 'https://mcp.example.com/sse',
      command: 'node',
      args: ['-e', PAYLOAD],
      env: {},
    };

    await listToolsFromServer(config);

    expect(m.stdio).not.toHaveBeenCalled();
    expect(m.sse).toHaveBeenCalledTimes(1);
  });
});

describe('a STDIO server starts only inside a sandbox', () => {
  const stdio: any = {
    uuid: UUID,
    name: 'local',
    type: McpServerType.STDIO,
    command: 'node',
    args: ['-e', PAYLOAD],
    env: { PATH: '/tmp/planted', LD_PRELOAD: '/tmp/planted/x.so' },
  };

  it('launches the trusted bubblewrap with a launcher environment the server cannot steer', async () => {
    await listToolsFromServer(stdio);

    const [launch] = spawned();
    expect(launch.command).toBe('/usr/bin/bwrap');
    expect(launch.env.PATH).not.toBe('/tmp/planted');
    expect(launch.env).not.toHaveProperty('LD_PRELOAD');
  });

  it('falls back to the trusted firejail when bubblewrap is missing', async () => {
    m.resolve.mockImplementation((name: string) => (name === 'firejail' ? '/usr/bin/firejail' : null));

    await listToolsFromServer(stdio);

    expect(spawned()[0].command).toBe('/usr/bin/firejail');
  });

  it('refuses to start when no isolation tool is installed', async () => {
    m.resolve.mockReturnValue(null);

    await expect(listToolsFromServer(stdio)).rejects.toThrow();
    expect(m.stdio).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls.flat().join(' ')).toMatch(/sandbox/i);
  });

  it('refuses to start when isolation is configured off', async () => {
    (PackageManagerConfig as any).ISOLATION_TYPE = 'none';

    await expect(listToolsFromServer(stdio)).rejects.toThrow();
    expect(m.stdio).not.toHaveBeenCalled();
  });

  it('refuses a configuration that asks to skip the sandbox', async () => {
    await expect(listToolsFromServer({ ...stdio, applySandboxing: false })).rejects.toThrow();
    expect(m.stdio).not.toHaveBeenCalled();
  });

  it('refuses on the non-discovery path too', async () => {
    m.resolve.mockReturnValue(null);

    await expect(listResourcesFromServer(stdio)).rejects.toThrow();
    expect(m.stdio).not.toHaveBeenCalled();
  });

  it('refuses before the package manager installs anything on the host', async () => {
    m.resolve.mockReturnValue(null);

    await expect(listResourcesFromServer(stdio)).rejects.toThrow();
    expect(packageManager.transformCommand).not.toHaveBeenCalled();
  });

  it('runs unsandboxed only under the explicit operator opt-out, and says so loudly', async () => {
    m.resolve.mockReturnValue(null);
    vi.stubEnv('MCP_ALLOW_UNSANDBOXED_STDIO', 'true');

    await listToolsFromServer(stdio);

    expect(spawned()[0].command).toBe('node');
    expect(errorSpy.mock.calls.flat().join(' ')).toContain('MCP_ALLOW_UNSANDBOXED_STDIO');
  });

  it('does not treat any other value as the opt-out', async () => {
    m.resolve.mockReturnValue(null);
    vi.stubEnv('MCP_ALLOW_UNSANDBOXED_STDIO', '1');

    await expect(listToolsFromServer(stdio)).rejects.toThrow();
    expect(m.stdio).not.toHaveBeenCalled();
  });
});
