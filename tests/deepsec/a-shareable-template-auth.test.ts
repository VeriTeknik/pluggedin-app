/**
 * createShareableTemplate is a public server action. It checked ownership only
 * when connection fields were requested; by default it still read the server's
 * custom instructions — private, unshared content — by a caller-supplied UUID
 * and returned them, to anyone, including a caller with no session.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  serverRows: vi.fn(),
  instructionsFindFirst: vi.fn(),
  profileFindFirst: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getAuthSession: m.getAuthSession, authOptions: {} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: () => {} }) }));
vi.mock('next/navigation', () => ({
  redirect: () => {
    const error: any = new Error('NEXT_REDIRECT');
    error.digest = 'NEXT_REDIRECT;replace;/login;307;';
    throw error;
  },
}));
vi.mock('@/lib/encryption', () => ({
  decryptServerData: (s: any) => ({ ...s, command: 'npx', args: [], env: {} }),
  encryptServerData: (s: any) => s,
}));
vi.mock('@/db', () => {
  const chain: any = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: () => m.serverRows(),
  };
  return {
    db: {
      select: () => chain,
      query: {
        users: { findFirst: async () => ({ id: 'owner' }) },
        profilesTable: { findFirst: m.profileFindFirst },
        customInstructionsTable: { findFirst: m.instructionsFindFirst },
      },
    },
  };
});

const { createShareableTemplate } = await import('@/app/actions/mcp-servers');

const SERVER = '22222222-2222-4222-8222-222222222222';
const PROFILE = '11111111-1111-4111-8111-111111111111';
const PRIVATE_INSTRUCTIONS = ['internal runbook: rotate the prod key via ...'];

const storedServer = {
  uuid: SERVER,
  profile_uuid: PROFILE,
  name: 'stored-name',
  description: 'stored description',
  type: 'STDIO',
  source: 'PLUGGEDIN',
  status: 'ACTIVE',
  created_at: new Date('2026-01-01'),
};

function ownedBy(userId: string) {
  return [{ server: storedServer, profile: { uuid: PROFILE }, project: { uuid: 'p1', user_id: userId } }];
}

beforeEach(() => {
  vi.clearAllMocks();
  m.instructionsFindFirst.mockResolvedValue({ mcp_server_uuid: SERVER, messages: PRIVATE_INSTRUCTIONS });
  m.profileFindFirst.mockResolvedValue(null);
  m.serverRows.mockResolvedValue(ownedBy('owner'));
});

describe('createShareableTemplate with default options', () => {
  it('refuses an anonymous caller without reading the instructions', async () => {
    m.getAuthSession.mockResolvedValue(null);

    await expect(createShareableTemplate({ uuid: SERVER, profile_uuid: PROFILE } as any)).rejects.toThrow();
    expect(m.instructionsFindFirst).not.toHaveBeenCalled();
    expect(m.profileFindFirst).not.toHaveBeenCalled();
  });

  it('refuses a caller who does not own the server without reading the instructions', async () => {
    m.getAuthSession.mockResolvedValue({ user: { id: 'attacker' } });

    await expect(createShareableTemplate({ uuid: SERVER, profile_uuid: PROFILE } as any)).rejects.toThrow(/access/i);
    expect(m.instructionsFindFirst).not.toHaveBeenCalled();
    expect(m.profileFindFirst).not.toHaveBeenCalled();
  });

  it('gives the owner the template, built from the stored server', async () => {
    m.getAuthSession.mockResolvedValue({ user: { id: 'owner' } });

    const template = await createShareableTemplate({ uuid: SERVER, profile_uuid: PROFILE, name: 'caller-supplied' } as any);

    expect(template.name).toBe('stored-name');
    expect(template.customInstructions).toEqual(PRIVATE_INSTRUCTIONS);
  });
});
