import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The three anonymous read paths for shared server recipes: a profile's
 * shared servers, a profile's shared collections, and community search. Each
 * returns stored templates after sanitizing them, so each has to come back
 * without the credentials a template stored before the sanitizer was fixed
 * still carries: a postgres:// or mongodb+srv:// password in a positional
 * argument, and the OAuth access token the refresh service writes into
 * streamableHTTPOptions.requestInit.headers.
 */

const PW = 'hunter' + '2-live';
const TOKEN = 'tok' + '-live-9f8e7d';

const poisonedTemplate = () => ({
  name: 'pg',
  type: 'STDIO',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-postgres', `postgres://alice:${PW}@db.example.com/app`],
  env: [`DATABASE_URL=mongodb+srv://alice:${PW}@cluster0.example.net/app`, `API_KEY=${TOKEN}`],
  streamableHTTPOptions: {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  },
});

const m = vi.hoisted(() => ({
  sharedServers: vi.fn(),
  sharedCollections: vi.fn(),
  selectRows: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getAuthSession: async () => null, authOptions: {} }));
vi.mock('@/lib/rate-limiter', () => ({
  RateLimiters: { api: async () => ({ allowed: true, limit: 60, remaining: 59, reset: Date.now() }) },
}));
vi.mock('@/app/actions/mcp-server-metrics', () => ({
  getServerRatingMetrics: async () => ({ success: false, metrics: null }),
}));
vi.mock('@/lib/registry/pluggedin-registry-vp-client', () => ({ registryVPClient: {} }));
vi.mock('@/lib/registry/registry-transformer', () => ({
  transformPluggedinRegistryToMcpIndex: vi.fn(),
}));
vi.mock('@/db', () => {
  const chain: any = {};
  for (const method of ['select', 'from', 'innerJoin', 'where', 'orderBy']) {
    chain[method] = () => chain;
  }
  chain.limit = () => m.selectRows();
  return {
    db: {
      ...chain,
      query: {
        sharedMcpServersTable: { findMany: m.sharedServers },
        sharedCollectionsTable: { findMany: m.sharedCollections },
      },
    },
  };
});

function expectNoSecrets(body: string) {
  expect(body).not.toContain(PW);
  expect(body).not.toContain(TOKEN);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/profile/[profileId]/shared-servers', () => {
  it('serves no database password or OAuth token from a stored template', async () => {
    m.sharedServers.mockResolvedValue([
      {
        uuid: 'share',
        created_at: new Date('2026-01-01'),
        profile: { uuid: 'profile', name: 'Public' },
        template: poisonedTemplate(),
        server: { uuid: 'server', command: 'npx', args: poisonedTemplate().args },
      },
    ]);
    const { GET } = await import('@/app/api/profile/[profileId]/shared-servers/route');

    const response = await GET(new NextRequest('https://plugged.in/api/profile/profile/shared-servers'), {
      params: Promise.resolve({ profileId: 'profile' }),
    });

    expect(response.status).toBe(200);
    const body = await response.text();
    expectNoSecrets(body);
    expect(JSON.parse(body)[0].template.args[1]).toBe('@modelcontextprotocol/server-postgres');
  });
});

describe('GET /api/profile/[profileId]/shared-collections', () => {
  beforeEach(() => {
    m.sharedCollections.mockResolvedValue([
      {
        uuid: 'collection',
        created_at: new Date('2026-01-01'),
        content: { servers: [poisonedTemplate()] },
        profile: { uuid: 'profile', name: 'Public', project_uuid: 'private-hub' },
      },
    ]);
  });

  it('serves no database password or OAuth token from a stored collection', async () => {
    const { GET } = await import('@/app/api/profile/[profileId]/shared-collections/route');

    const response = await GET(
      new NextRequest('https://plugged.in/api/profile/profile/shared-collections'),
      { params: Promise.resolve({ profileId: 'profile' }) }
    );

    expect(response.status).toBe(200);
    expectNoSecrets(await response.text());
  });

  it('does not publish the owner’s Hub id', async () => {
    const { GET } = await import('@/app/api/profile/[profileId]/shared-collections/route');

    const response = await GET(
      new NextRequest('https://plugged.in/api/profile/profile/shared-collections'),
      { params: Promise.resolve({ profileId: 'profile' }) }
    );

    const data = await response.json();
    expect(data[0].profile).toEqual({ uuid: 'profile', name: 'Public' });
  });
});

describe('GET /api/service/search?source=COMMUNITY', () => {
  it('serves no database password or OAuth token, and lists env names only', async () => {
    m.selectRows.mockResolvedValue([
      {
        sharedServer: {
          uuid: 'share',
          title: 'pg',
          description: 'Postgres',
          template: poisonedTemplate(),
          updated_at: new Date('2026-01-01'),
          is_claimed: false,
          claimed_by_user_id: null,
          claimed_at: null,
          registry_server_uuid: null,
        },
        profile: {},
        user: { username: 'alice' },
      },
    ]);
    const { GET } = await import('@/app/api/service/search/route');

    const response = await GET(new NextRequest('https://plugged.in/api/service/search?source=COMMUNITY'));

    expect(response.status).toBe(200);
    const body = await response.text();
    expectNoSecrets(body);
    const entry = JSON.parse(body).results.share;
    expect(entry.envs).toEqual(['DATABASE_URL', 'API_KEY']);
    expect(entry.args[1]).toBe('@modelcontextprotocol/server-postgres');
  });
});
