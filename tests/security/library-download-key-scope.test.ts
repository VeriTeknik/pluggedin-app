import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDocByUuidFor = vi.fn(async () => null);
const authenticateApiKey = vi.fn();

vi.mock('@/lib/library/queries', () => ({ getDocByUuidFor }));
vi.mock('@/app/api/auth', () => ({ authenticateApiKey }));
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn(async () => null) }));

const { GET } = await import('@/app/api/library/download/[uuid]/route');

const KEY_PROJECT = 'project-the-key-is-scoped-to';
const OTHER_PROJECT = 'a-different-project';

beforeEach(() => {
  vi.clearAllMocks();
  getDocByUuidFor.mockResolvedValue(null);
  authenticateApiKey.mockResolvedValue({
    user: { id: 'user-1' },
    activeProfile: { project_uuid: KEY_PROJECT },
  });
});

const request = (url: string) =>
  ({
    url,
    headers: new Headers({ authorization: 'Bearer pk_live' }),
  }) as never;

/**
 * API keys are project-scoped so that a leaked key cannot reach everything the
 * owner has. The route read `?projectUuid=` in preference to the project the
 * key was actually issued for, so a key scoped to one project could fetch a
 * document from another.
 */
describe('the download route keeps an API key inside its project', () => {
  it('ignores a projectUuid query parameter when a key authenticated', async () => {
    await GET(request(`https://x/api/library/download/doc-1?projectUuid=${OTHER_PROJECT}`), {
      params: Promise.resolve({ uuid: 'doc-1' }),
    } as never);

    expect(getDocByUuidFor).toHaveBeenCalledWith('user-1', 'doc-1', KEY_PROJECT);
    expect(getDocByUuidFor).not.toHaveBeenCalledWith('user-1', 'doc-1', OTHER_PROJECT);
  });

  it('still scopes to the key project when no parameter is given', async () => {
    await GET(request('https://x/api/library/download/doc-1'), {
      params: Promise.resolve({ uuid: 'doc-1' }),
    } as never);

    expect(getDocByUuidFor).toHaveBeenCalledWith('user-1', 'doc-1', KEY_PROJECT);
  });
});
