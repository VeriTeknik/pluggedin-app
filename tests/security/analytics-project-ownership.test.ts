import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), cache: vi.fn(), handler: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => ({ user: { id: 'caller' } }) }));
vi.mock('@/lib/rate-limiter', () => ({ rateLimiter: { check: async () => ({ success: true }) } }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn() } }));
vi.mock('@/lib/analytics-cache', () => ({ analyticsCache: { get: mocks.cache, set: vi.fn() }, getCacheKey: () => 'key' }));
vi.mock('@/db', () => ({ db: { select: () => ({ from: () => ({
  innerJoin: () => ({ where: () => ({ limit: mocks.query }) }),
  where: () => ({ limit: mocks.query }),
}) }) } }));
import { withAnalytics } from '@/app/actions/analytics-hof';
const action = withAnalytics(
  (projectUuid?: string) => ({ profileUuid: 'owned-profile', projectUuid }),
  () => 'rate-key', mocks.handler, { cache: { enabled: true } },
);
beforeEach(() => { vi.resetAllMocks(); mocks.cache.mockReturnValue(null); mocks.handler.mockResolvedValue('private docs'); });
it('rejects a foreign project before reading a warmed cache or running the handler', async () => {
  mocks.query.mockResolvedValueOnce([{ uuid: 'owned-profile' }]).mockResolvedValueOnce([]);
  mocks.cache.mockReturnValue('victim cached docs');
  expect(await action('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toMatchObject({ success: false, error: expect.stringMatching(/unauthorized/i) });
  expect(mocks.cache).not.toHaveBeenCalled();
  expect(mocks.handler).not.toHaveBeenCalled();
});
it('allows an owned project and preserves profile-only analytics', async () => {
  mocks.query.mockResolvedValue([{ uuid: 'owned-resource' }]);
  expect(await action('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).toMatchObject({ success: true, data: 'private docs' });
  expect(await action()).toMatchObject({ success: true });
  expect(mocks.handler).toHaveBeenCalledTimes(2);
});
