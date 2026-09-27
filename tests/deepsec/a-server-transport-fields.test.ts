/**
 * A remote (SSE / Streamable HTTP) server runs no local process, so it must not
 * be stored with a command or args. createMcpServer, updateMcpServer,
 * bulkImportMcpServers and POST /api/mcp-servers all persisted whatever process
 * fields the caller sent beside a remote type — the half of the transport
 * confusion that lived in the database. The runtime no longer trusts that
 * (see a-stdio-launch-gate), and the write paths no longer store it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  encrypt: vi.fn((data: Record<string, unknown>) => ({ ...data })),
  insertValues: vi.fn(),
  updateSet: vi.fn(),
  getAuthSession: vi.fn(),
  profileRows: vi.fn(),
  serverFindFirst: vi.fn(),
  apiAuth: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getAuthSession: m.getAuthSession }));
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: () => {} }) }));
vi.mock('next/navigation', () => ({
  redirect: () => {
    throw new Error('NEXT_REDIRECT');
  },
}));
vi.mock('@/lib/encryption', () => ({
  encryptServerData: m.encrypt,
  decryptServerData: (d: unknown) => d,
}));
vi.mock('@/lib/server-action-rate-limiter', () => ({
  rateLimitServerAction: async () => ({ allowed: true }),
  formatRateLimitError: () => 'rate limited',
  ServerActionRateLimits: { serverModification: {}, serverRead: {} },
}));
vi.mock('@/lib/services/mcp-server-slug-service', () => ({
  McpServerSlugService: { generateAndSetSlug: async () => undefined },
}));
vi.mock('@/app/actions/discover-mcp-tools', () => ({ discoverSingleServerTools: async () => ({ success: true }) }));
vi.mock('@/app/actions/mcp-server-metrics', () => ({
  getServerRatingMetrics: async () => undefined,
  trackServerInstallation: async () => undefined,
}));
vi.mock('@/app/api/auth', () => ({ authenticateApiKey: m.apiAuth }));
vi.mock('@/db', () => {
  const insert = () => ({
    values: (values: unknown) => {
      m.insertValues(values);
      return { returning: async () => [{ uuid: '33333333-3333-4333-8333-333333333333', name: 'srv', type: 'SSE' }] };
    },
  });
  const update = () => ({
    set: (values: unknown) => {
      m.updateSet(values);
      return { where: async () => undefined };
    },
  });
  const selectChain: any = {
    from: () => selectChain,
    innerJoin: () => selectChain,
    where: () => selectChain,
    limit: () => m.profileRows(),
  };
  return {
    db: {
      insert,
      update,
      select: () => selectChain,
      query: {
        users: { findFirst: async () => ({ id: 'owner' }) },
        mcpServersTable: { findFirst: m.serverFindFirst },
      },
      transaction: async (fn: (tx: unknown) => unknown) => fn({ insert, update }),
    },
  };
});

const { bulkImportMcpServers, createMcpServer, importSharedServer, updateMcpServer } = await import('@/app/actions/mcp-servers');
const { POST } = await import('@/app/api/mcp-servers/route');

const PROFILE = '11111111-1111-4111-8111-111111111111';
const SERVER = '22222222-2222-4222-8222-222222222222';
const HOSTILE_ARGS = ['-e', "require('child_process').execSync('id')", 'mcp-remote'];

/** The plaintext handed to encryption — what ends up persisted. */
function persisted(): Record<string, unknown> {
  return m.encrypt.mock.calls.at(-1)![0];
}

beforeEach(() => {
  vi.clearAllMocks();
  m.getAuthSession.mockResolvedValue({ user: { id: 'owner' } });
  m.profileRows.mockResolvedValue([
    { profile: { uuid: PROFILE, project_uuid: 'p1' }, project: { uuid: 'p1', user_id: 'owner' } },
  ]);
  m.serverFindFirst.mockResolvedValue(undefined);
  m.apiAuth.mockResolvedValue({ activeProfile: { uuid: PROFILE }, user: { id: 'owner' } });
});

describe('createMcpServer', () => {
  it('stores no command or args for a remote server', async () => {
    const result = await createMcpServer({
      name: 'remote',
      profileUuid: PROFILE,
      type: 'SSE' as any,
      url: 'https://mcp.example.com/sse',
      command: 'node',
      args: HOSTILE_ARGS,
    });

    expect(result.success).toBe(true);
    expect(persisted().command ?? null).toBeNull();
    expect(persisted().args ?? []).toEqual([]);
  });

  it('keeps the args of a STDIO server', async () => {
    await createMcpServer({ name: 'local', profileUuid: PROFILE, command: 'npx', args: ['-y', 'some-server'] });

    expect(persisted().args).toEqual(['-y', 'some-server']);
  });
});

describe('bulkImportMcpServers', () => {
  it('stores no command or args for a remote entry', async () => {
    await bulkImportMcpServers(
      {
        mcpServers: {
          remote: { type: 'STREAMABLE_HTTP' as any, url: 'https://mcp.example.com/mcp', command: 'node', args: HOSTILE_ARGS },
        },
      },
      PROFILE
    );

    expect(persisted().command ?? null).toBeNull();
    expect(persisted().args ?? []).toEqual([]);
  });

  it('keeps a STDIO entry intact', async () => {
    await bulkImportMcpServers({ mcpServers: { local: { command: 'npx', args: ['some-server'] } } }, PROFILE);

    expect(persisted().command).toBe('npx');
    expect(persisted().args).toEqual(['some-server']);
  });
});

describe('updateMcpServer', () => {
  it('drops command and args sent with a remote type', async () => {
    const result = await updateMcpServer(PROFILE, SERVER, {
      type: 'SSE' as any,
      url: 'https://mcp.example.com/sse',
      command: 'node',
      args: HOSTILE_ARGS,
    });

    expect(result.success).toBe(true);
    expect(persisted().command ?? null).toBeNull();
    expect(persisted().args ?? []).toEqual([]);
  });

  it('drops args sent for a server already stored as remote', async () => {
    m.serverFindFirst.mockResolvedValue({ uuid: SERVER, profile_uuid: PROFILE, type: 'STREAMABLE_HTTP' });

    await updateMcpServer(PROFILE, SERVER, { command: 'node', args: HOSTILE_ARGS });

    expect(persisted().command ?? null).toBeNull();
    expect(persisted().args ?? []).toEqual([]);
  });

  it('clears process fields left over when a server is switched to a remote type', async () => {
    await updateMcpServer(PROFILE, SERVER, { type: 'SSE' as any, url: 'https://mcp.example.com/sse' });

    expect(persisted()).toHaveProperty('command', null);
    expect(persisted()).toHaveProperty('args', []);
  });

  it('still updates a STDIO server command', async () => {
    await updateMcpServer(PROFILE, SERVER, { type: 'STDIO' as any, command: 'npx', args: ['some-server'] });

    expect(persisted().command).toBe('npx');
    expect(persisted().args).toEqual(['some-server']);
  });
});

describe('importSharedServer', () => {
  it('stores no command or args for a remote server', async () => {
    const result = await importSharedServer(
      PROFILE,
      { type: 'SSE', url: 'https://mcp.example.com/sse', command: 'node', args: ['server.js'] },
      'shared'
    );

    expect(result.success).toBe(true);
    const stored = m.insertValues.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(stored.command ?? null).toBeNull();
    expect(stored.args ?? []).toEqual([]);
  });

  it('refuses a remote server that smuggles a package in front of mcp-remote', async () => {
    const calls = m.insertValues.mock.calls.length;
    const result = await importSharedServer(
      PROFILE,
      { type: 'SSE', url: 'https://mcp.example.com/sse', command: 'npx', args: ['-y', 'some-pkg', 'mcp-remote'] },
      'shared'
    );

    expect(result.success).toBe(false);
    expect(m.insertValues.mock.calls.length).toBe(calls);
  });
});

describe('POST /api/mcp-servers', () => {
  const post = (body: unknown) =>
    POST(
      new Request('http://localhost/api/mcp-servers', {
        method: 'POST',
        headers: { authorization: 'Bearer pg_in_test', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    );

  it('stores no command or args for a remote server', async () => {
    const res = await post({ name: 'remote', type: 'SSE', status: 'ACTIVE', url: 'https://mcp.example.com/sse', command: 'node', args: HOSTILE_ARGS });

    expect(res.status).toBe(200);
    expect(persisted().command ?? null).toBeNull();
    expect(persisted().args ?? []).toEqual([]);
  });

  it('rejects a STDIO command outside the allowlist', async () => {
    const res = await post({ name: 'local', type: 'STDIO', status: 'ACTIVE', command: '/bin/sh', args: ['-c', 'id'] });

    expect(res.status).toBe(400);
    expect(m.insertValues).not.toHaveBeenCalled();
  });

  it('rejects an unknown server type', async () => {
    const res = await post({ name: 'x', type: 'SHELL', status: 'ACTIVE', command: 'npx' });

    expect(res.status).toBe(400);
    expect(m.insertValues).not.toHaveBeenCalled();
  });

  it('rejects a remote URL that fails validation', async () => {
    const res = await post({ name: 'x', type: 'SSE', status: 'ACTIVE', url: 'file:///etc/passwd' });

    expect(res.status).toBe(400);
    expect(m.insertValues).not.toHaveBeenCalled();
  });

  it('still creates a valid STDIO server', async () => {
    const res = await post({ name: 'local', type: 'STDIO', status: 'ACTIVE', command: 'npx', args: ['some-server'] });

    expect(res.status).toBe(200);
    expect(persisted().command).toBe('npx');
    expect(persisted().args).toEqual(['some-server']);
  });
});
