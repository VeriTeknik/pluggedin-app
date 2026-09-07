import { expect, it, vi } from 'vitest';
const update = vi.hoisted(() => vi.fn((_values: Record<string, any>) => ({ where: async () => undefined })));
vi.mock('bcrypt', () => ({ hash: async () => 'new-hash' }));
vi.mock('@/lib/rate-limiter-redis', () => ({ EnhancedRateLimiters: { passwordReset: async () => ({ allowed: true }) } }));
vi.mock('@/db', () => ({ db: {
  query: { passwordResetTokens: { findFirst: async () => ({ token: 'reset', identifier: 'owner@example.com', expires: new Date(Date.now() + 60000) }) }, users: { findFirst: async () => ({ id: 'owner' }) } },
  update: () => ({ set: update }), delete: () => ({ where: async () => undefined }),
} }));
import { NextRequest } from 'next/server';

import { POST } from '@/app/api/auth/reset-password/route';
it('advances the session revocation timestamp when resetting the password', async () => {
  const before = Date.now();
  const response = await POST(new NextRequest('https://plugged.in/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: 'reset', password: 'new-password' }) }));
  expect(response.status).toBe(200);
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ password: 'new-hash', password_changed_at: expect.any(Date) }));
  expect(update.mock.calls[0][0].password_changed_at.getTime()).toBeGreaterThanOrEqual(before);
});
