/**
 * Importing a public collection stored command and args beside a remote
 * (SSE / Streamable HTTP) type — the same transport confusion as the other
 * write paths, fed by content anyone can publish.
 */
import { beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSharedCollection: vi.fn(),
  values: vi.fn((_row: Record<string, unknown>) => ({ returning: async () => [{ uuid: 'new-server' }] })),
}));

vi.mock('@/app/actions/social', () => ({ getSharedCollection: m.getSharedCollection }));
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn(async () => ({ user: { id: 'u1' } })) }));
vi.mock('@/lib/encryption', () => ({ encryptServerData: (d: unknown) => d }));
vi.mock('@/db', () => ({
  db: {
    query: {
      projectsTable: {
        findFirst: vi.fn(async () => ({ uuid: 'p1', active_profile_uuid: 'profile-1', profiles: [{ uuid: 'profile-1' }] })),
      },
      mcpServersTable: { findFirst: vi.fn(async () => undefined) },
    },
    insert: vi.fn(() => ({ values: m.values })),
  },
}));

const { POST } = await import('@/app/api/collections/import/route');

const request = () => ({ json: async () => ({ collectionUuid: 'c1', importType: 'existing' }) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
});

it('stores no command or args for a remote server', async () => {
  m.getSharedCollection.mockResolvedValue({
    uuid: 'c1',
    content: {
      servers: [
        { name: 'remote', type: 'SSE', url: 'https://mcp.example.com/sse', command: 'node', args: ['server.js'] },
      ],
    },
  });

  await POST(request());

  const stored = m.values.mock.calls[0][0];
  expect(stored.command ?? null).toBeNull();
  expect(stored.args ?? []).toEqual([]);
});

it('stores nothing for a remote server that smuggles a package in front of mcp-remote', async () => {
  m.getSharedCollection.mockResolvedValue({
    uuid: 'c1',
    content: {
      servers: [
        { name: 'remote', type: 'SSE', url: 'https://mcp.example.com/sse', command: 'npx', args: ['-y', 'some-pkg', 'mcp-remote'] },
      ],
    },
  });

  await POST(request());

  expect(m.values).not.toHaveBeenCalled();
});

it('keeps a STDIO server intact', async () => {
  m.getSharedCollection.mockResolvedValue({
    uuid: 'c1',
    content: { servers: [{ name: 'local', type: 'STDIO', command: 'npx', args: ['some-mcp-server'] }] },
  });

  await POST(request());

  const stored = m.values.mock.calls[0][0];
  expect(stored.command).toBe('npx');
  expect(stored.args).toEqual(['some-mcp-server']);
});
