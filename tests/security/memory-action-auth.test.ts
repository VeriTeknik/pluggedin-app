import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getServerSession } from 'next-auth';

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {}, getAuthSession: vi.fn() }));
vi.mock('@/db', () => ({ db: { query: {} } }));
vi.mock('@/lib/memory/gut-agent', () => ({ queryIntuition: vi.fn() }));
vi.mock('@/lib/memory/cbp/injection-engine', () => ({
  injectContextual: vi.fn(),
  submitFeedback: vi.fn(),
}));

const { queryGutIntuition, queryCBPPatterns } = await import('@/app/actions/memory');
const { queryIntuition } = vi.mocked(await import('@/lib/memory/gut-agent'));
const { injectContextual } = vi.mocked(await import('@/lib/memory/cbp/injection-engine'));

const mockedGetServerSession = vi.mocked(getServerSession);

beforeEach(() => {
  vi.clearAllMocks();
  queryIntuition.mockResolvedValue({ success: true } as any);
  injectContextual.mockResolvedValue({ success: true } as any);
});

describe('queryGutIntuition authentication', () => {
  it('refuses an unauthenticated caller', async () => {
    mockedGetServerSession.mockResolvedValue(null as any);

    const result = await queryGutIntuition('what do you know about me');

    expect(result.success).toBe(false);
  });

  it('does not run an embedding search for an unauthenticated caller', async () => {
    mockedGetServerSession.mockResolvedValue(null as any);

    await queryGutIntuition('attacker supplied string');

    expect(queryIntuition).not.toHaveBeenCalled();
  });

  it('rejects before validating input, like its authenticated siblings', async () => {
    mockedGetServerSession.mockResolvedValue(null as any);

    const gut = await queryGutIntuition('');
    const cbp = await queryCBPPatterns('');

    expect(gut.success).toBe(false);
    expect(cbp.success).toBe(false);
    expect(queryIntuition).not.toHaveBeenCalled();
    expect(injectContextual).not.toHaveBeenCalled();
  });

  it('serves an authenticated caller', async () => {
    mockedGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any);

    const result = await queryGutIntuition('what do you know about me');

    expect(result.success).toBe(true);
    expect(queryIntuition).toHaveBeenCalled();
  });
});
