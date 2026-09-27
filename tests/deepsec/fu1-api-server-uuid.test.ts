/**
 * POST /api/mcp-servers inserted the uuid the caller put in the body. A
 * server's uuid names its directory in the shared package store
 * (`<store>/servers/<uuid>`: installs, workspace, OAuth tokens), which outlives
 * the database row. Choosing it means choosing which directory a new server
 * inherits — a deleted server's, with whatever it left behind. The column has a
 * random default; the server picks.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ insertValues: vi.fn(), apiAuth: vi.fn() }));

vi.mock('@/app/api/auth', () => ({ authenticateApiKey: m.apiAuth }));
vi.mock('@/lib/encryption', () => ({
  encryptServerData: (data: Record<string, unknown>) => ({ ...data }),
  decryptServerData: (data: unknown) => data,
}));
vi.mock('@/lib/oauth/token-refresh-service', () => ({ validateAndRefreshToken: async () => false }));
vi.mock('@/db', () => ({
  db: {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        m.insertValues(values);
        return { returning: async () => [{ ...values, uuid: values.uuid ?? 'db-generated' }] };
      },
    }),
  },
}));

const { POST } = await import('@/app/api/mcp-servers/route');

const PROFILE = '11111111-1111-4111-8111-111111111111';
const CHOSEN = '22222222-2222-4222-8222-222222222222';

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/mcp-servers', {
      method: 'POST',
      headers: { authorization: 'Bearer pg_in_test', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  m.apiAuth.mockResolvedValue({ activeProfile: { uuid: PROFILE }, user: { id: 'owner' } });
});

describe('POST /api/mcp-servers', () => {
  it('does not insert a uuid the caller chose', async () => {
    const res = await post({ uuid: CHOSEN, name: 'local', type: 'STDIO', status: 'ACTIVE', command: 'npx', args: ['some-server'] });

    expect(res.status).toBe(200);
    expect(m.insertValues).toHaveBeenCalledTimes(1);
    expect(m.insertValues.mock.calls[0][0].uuid).toBeUndefined();
    expect((await res.json()).uuid).toBe('db-generated');
  });

  it('still creates a server when no uuid is given', async () => {
    const res = await post({ name: 'local', type: 'STDIO', status: 'ACTIVE', command: 'npx', args: ['some-server'] });

    expect(res.status).toBe(200);
    expect(m.insertValues.mock.calls[0][0].profile_uuid).toBe(PROFILE);
  });
});
