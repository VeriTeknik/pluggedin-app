/**
 * getPlaygroundSettings / updatePlaygroundSettings are exported Server Actions
 * that read and wrote playground_settings by a caller-supplied profileUuid with
 * no session and no ownership check. Anyone holding a profile UUID could read
 * another tenant's settings or overwrite provider/model/RAG with their own.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  profileRows: [] as unknown[],
  settingsFindFirst: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getAuthSession: async () => m.session }));
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: () => {} }) }));
vi.mock('next/navigation', () => ({
  // Same shape as Next's own redirect error, so isRedirectError recognises it.
  redirect: (url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  },
}));
vi.mock('@/db', () => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => m.profileRows,
  };
  return {
    db: {
      query: {
        users: { findFirst: async () => (m.session ? { id: m.session.user.id } : undefined) },
        playgroundSettingsTable: { findFirst: m.settingsFindFirst },
      },
      select: () => chain,
      update: (...args: unknown[]) => {
        m.update(...args);
        return { set: () => ({ where: async () => undefined }) };
      },
      insert: (...args: unknown[]) => {
        m.insert(...args);
        return { values: async () => undefined };
      },
    },
  };
});

const OWNER = 'owner-user';
const ATTACKER = 'attacker-user';
const PROFILE = '11111111-1111-4111-8111-111111111111';

const VALID = {
  provider: 'anthropic' as const,
  model: 'claude-sonnet-4',
  temperature: 0,
  maxTokens: 1000,
  logLevel: 'info' as const,
  ragEnabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.session = { user: { id: ATTACKER } };
  m.profileRows = [{ profile: { uuid: PROFILE, project_uuid: 'p1' }, project: { uuid: 'p1', user_id: OWNER } }];
  m.settingsFindFirst.mockResolvedValue({
    provider: 'openai',
    model: 'victim-model',
    temperature: 0,
    max_tokens: 2000,
    log_level: 'debug',
    rag_enabled: false,
  });
});

async function load() {
  return import('@/app/actions/playground-settings');
}

describe('playground settings require the caller to own the profile', () => {
  it('refuses to read a profile owned by someone else', async () => {
    const { getPlaygroundSettings } = await load();

    const result = await getPlaygroundSettings(PROFILE);

    expect(result.success).toBe(false);
    expect(result).not.toHaveProperty('settings');
    expect(m.settingsFindFirst).not.toHaveBeenCalled();
  });

  it('refuses to overwrite a profile owned by someone else', async () => {
    const { updatePlaygroundSettings } = await load();

    const result = await updatePlaygroundSettings(PROFILE, VALID);

    expect(result.success).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller', async () => {
    m.session = null;
    const { getPlaygroundSettings, updatePlaygroundSettings } = await load();

    await expect(getPlaygroundSettings(PROFILE)).rejects.toThrow(/NEXT_REDIRECT/);
    await expect(updatePlaygroundSettings(PROFILE, VALID)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(m.settingsFindFirst).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });

  it('lets the owner read and write', async () => {
    m.session = { user: { id: OWNER } };
    const { getPlaygroundSettings, updatePlaygroundSettings } = await load();

    const read = await getPlaygroundSettings(PROFILE);
    expect(read.success).toBe(true);
    expect((read as { settings: { model: string } }).settings.model).toBe('victim-model');

    const written = await updatePlaygroundSettings(PROFILE, VALID);
    expect(written.success).toBe(true);
    expect(m.update).toHaveBeenCalledTimes(1);
  });

  it('validates the settings shape at runtime', async () => {
    m.session = { user: { id: OWNER } };
    const { updatePlaygroundSettings } = await load();

    const result = await updatePlaygroundSettings(PROFILE, {
      ...VALID,
      model: { $ne: 1 } as unknown as string,
    });

    expect(result.success).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
});
