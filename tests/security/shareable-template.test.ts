import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db');
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn(), authOptions: {} }));
vi.mock('@/lib/encryption', () => ({
  decryptServerData: vi.fn((s: any) => ({
    ...s,
    command: 'npx',
    args: ['-y', '@victim/server', '--token=tok-live-abcdef'],
    env: { GITHUB_PAT: 'ghp_liveVictimToken', HOME_DIR: '/home/victim' },
    url: 'https://api.example.com/mcp?apikey=live-url-key',
    transport: 'streamable_http',
    streamableHTTPOptions: {
      sessionId: 'sess-live-1234',
      headers: { Authorization: 'Bearer live-header-token' },
    },
  })),
  encryptServerData: vi.fn((s: any) => s),
}));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ delete: vi.fn() })) }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    const error: any = new Error('NEXT_REDIRECT');
    error.digest = 'NEXT_REDIRECT;replace;/login;307;';
    throw error;
  }),
}));

const { createShareableTemplate } = await import('@/app/actions/mcp-servers');
const { db } = await import('@/db');
const { getAuthSession } = vi.mocked(await import('@/lib/auth'));

const mockedDb = vi.mocked(db) as any;

const SERVER_UUID = '22222222-2222-4222-8222-222222222222';
const PROFILE_UUID = '11111111-1111-4111-8111-111111111111';

const encryptedServer: any = {
  uuid: SERVER_UUID,
  profile_uuid: PROFILE_UUID,
  name: 'victim-server',
  description: 'desc',
  type: 'STDIO',
  source: 'COMMUNITY',
  status: 'ACTIVE',
  created_at: new Date('2026-01-01'),
  command_encrypted: 'ciphertext-command',
  args_encrypted: 'ciphertext-args',
  env_encrypted: 'ciphertext-env',
  url_encrypted: 'ciphertext-url',
};

const SECRETS = [
  'ghp_liveVictimToken',
  'tok-live-abcdef',
  'live-url-key',
  'live-header-token',
  'sess-live-1234',
];

beforeEach(() => {
  vi.clearAllMocks();
  getAuthSession.mockResolvedValue(null as any);
  mockedDb.query = {
    profilesTable: { findFirst: vi.fn().mockResolvedValue(null) },
    customInstructionsTable: { findFirst: vi.fn().mockResolvedValue(null) },
    mcpServersTable: { findFirst: vi.fn().mockResolvedValue(null) },
    users: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  mockedDb.select = vi.fn(() => {
    const chain: any = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      then: (resolve: any, reject: any) => Promise.resolve([]).then(resolve, reject),
    };
    return chain;
  });
});

describe('createShareableTemplate default output', () => {
  it('carries no connection secrets', async () => {
    const template = await createShareableTemplate(encryptedServer);

    const serialized = JSON.stringify(template);
    for (const secret of SECRETS) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('omits the fields that hold them', async () => {
    const template = await createShareableTemplate(encryptedServer);

    expect(template.command).toBeUndefined();
    expect(template.args).toBeUndefined();
    expect(template.env).toBeUndefined();
    expect(template.url).toBeUndefined();
    expect(template.streamableHTTPOptions).toBeUndefined();
  });

  it('still describes the server', async () => {
    const template = await createShareableTemplate(encryptedServer);

    expect(template.name).toBe('victim-server');
    expect(template.type).toBe('STDIO');
    expect(template.originalServerUuid).toBe(SERVER_UUID);
  });
});

describe('createShareableTemplate with connection fields requested', () => {
  it('refuses an anonymous caller', async () => {
    getAuthSession.mockResolvedValue(null as any);

    await expect(
      createShareableTemplate(encryptedServer, { includeConnectionFields: true })
    ).rejects.toThrow();
  });

  it('refuses a caller who does not own the server', async () => {
    getAuthSession.mockResolvedValue({ user: { id: 'attacker' }, expires: '2099-01-01' } as any);
    mockedDb.query.users.findFirst.mockResolvedValue({ id: 'attacker' });
    mockedDb.select = vi.fn(() => {
      const chain: any = {
        from: vi.fn(() => chain),
        where: vi.fn(() => chain),
        innerJoin: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        then: (resolve: any, reject: any) =>
          Promise.resolve([
            {
              server: encryptedServer,
              profile: { uuid: PROFILE_UUID, project_uuid: 'project-1' },
              project: { uuid: 'project-1', user_id: 'owner' },
            },
          ]).then(resolve, reject),
      };
      return chain;
    });

    await expect(
      createShareableTemplate(encryptedServer, { includeConnectionFields: true })
    ).rejects.toThrow(/access/i);
  });

  it('ignores caller-supplied ciphertext and decrypts the stored row instead', async () => {
    getAuthSession.mockResolvedValue({ user: { id: 'owner' }, expires: '2099-01-01' } as any);
    mockedDb.query.users.findFirst.mockResolvedValue({ id: 'owner' });
    const storedServer = { ...encryptedServer, name: 'stored-name' };
    mockedDb.select = vi.fn(() => {
      const chain: any = {
        from: vi.fn(() => chain),
        where: vi.fn(() => chain),
        innerJoin: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        then: (resolve: any, reject: any) =>
          Promise.resolve([
            {
              server: storedServer,
              profile: { uuid: PROFILE_UUID, project_uuid: 'project-1' },
              project: { uuid: 'project-1', user_id: 'owner' },
            },
          ]).then(resolve, reject),
      };
      return chain;
    });

    const { decryptServerData } = vi.mocked(await import('@/lib/encryption'));
    const template = await createShareableTemplate(
      { ...encryptedServer, command_encrypted: 'someone-elses-ciphertext' } as any,
      { includeConnectionFields: true }
    );

    expect(decryptServerData).toHaveBeenCalledWith(expect.objectContaining({ name: 'stored-name' }));
    expect(template.command).toBeDefined();
  });

  it('gives the owner the structure with placeholders, not raw credentials', async () => {
    getAuthSession.mockResolvedValue({ user: { id: 'owner' }, expires: '2099-01-01' } as any);
    mockedDb.query.users.findFirst.mockResolvedValue({ id: 'owner' });
    mockedDb.select = vi.fn(() => {
      const chain: any = {
        from: vi.fn(() => chain),
        where: vi.fn(() => chain),
        innerJoin: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        then: (resolve: any, reject: any) =>
          Promise.resolve([
            {
              server: encryptedServer,
              profile: { uuid: PROFILE_UUID, project_uuid: 'project-1' },
              project: { uuid: 'project-1', user_id: 'owner' },
            },
          ]).then(resolve, reject),
      };
      return chain;
    });

    const template = await createShareableTemplate(encryptedServer, {
      includeConnectionFields: true,
    });

    // Structure the importer needs survives...
    expect(template.command).toBe('npx');
    expect(Object.keys(template.env)).toEqual(['GITHUB_PAT', 'HOME_DIR']);
    // ...the credentials do not.
    const serialized = JSON.stringify(template);
    for (const secret of SECRETS) {
      expect(serialized).not.toContain(secret);
    }
  });
});
