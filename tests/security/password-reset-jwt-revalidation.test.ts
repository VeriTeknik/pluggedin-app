import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock('@auth/drizzle-adapter', () => ({ DrizzleAdapter: () => ({}) }));
vi.mock('@/db', () => ({ db: { query: { users: { findFirst: m.user } } } }));
vi.mock('@/lib/admin-notifications', () => ({ notifyAdminsOfNewUser: vi.fn() }));
vi.mock('@/lib/welcome-emails', () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock('@/lib/default-project-creation', () => ({ createDefaultProject: vi.fn() }));
import { authOptions } from '@/lib/auth';
const changed = new Date('2026-09-07T12:00:00Z');
const run = (extra: object) => authOptions.callbacks!.jwt!({ token: { id: 'owner', username: 'owner', is_admin: false, userValidationTs: 0, ...extra } } as never);
beforeEach(() => { vi.clearAllMocks(); m.user.mockResolvedValue({ id: 'owner', username: 'owner', is_admin: false, password_changed_at: changed }); });
it.each([null, undefined])('revokes a pre-reset session with passwordChangedAt %s', async (passwordChangedAt) => {
 expect(await run({ passwordChangedAt })).not.toHaveProperty('id');
});
it('does not refresh away an old password timestamp when legacy user fields are missing', async () => {
 expect(await run({ username: undefined, passwordChangedAt: changed.getTime() - 1 })).not.toHaveProperty('id');
});
it('preserves a session issued against the current password version', async () => {
 expect(await run({ passwordChangedAt: changed.getTime() })).toHaveProperty('id', 'owner');
});
it('preserves null-version sessions when no password change has occurred', async () => {
 m.user.mockResolvedValue({ id: 'owner', password_changed_at: null });
 expect(await run({ passwordChangedAt: null })).toHaveProperty('id', 'owner');
});
