import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ tx: vi.fn(), remove: vi.fn(), email: vi.fn() }));
vi.mock('@/db', () => ({ db: { transaction: m.tx } }));
vi.mock('bcrypt', () => ({ hash: async () => 'attacker-hash' }));
vi.mock('@/lib/auth-security', () => ({ isPasswordComplex: () => ({ isValid: true }) }));
vi.mock('@/lib/admin-notifications', () => ({ notifyAdminsOfNewUser: vi.fn() }));
vi.mock('@/lib/default-project-creation', () => ({ createDefaultProject: async () => ({ uuid: 'project' }) }));
vi.mock('@/lib/email', () => ({ generateVerificationEmail: () => ({ subject: 'verify', html: 'verify' }), sendEmail: m.email }));
vi.mock('@/lib/welcome-emails', () => ({ sendWelcomeEmail: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/rate-limiter-redis', () => ({ EnhancedRateLimiters: { auth: async () => ({ allowed: true }), registration: async () => ({ allowed: true }) } }));
import { NextRequest } from 'next/server';

import { POST } from '@/app/api/auth/register/route';
it('never replaces a pending account or sends a verification link for an attacker password', async () => {
 m.tx.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505', constraint: 'users_email_unique' }));
 m.tx.mockImplementation(async callback => callback({
  select: () => ({ from: () => ({ where: () => ({ for: async () => [{ id: 'victim', emailVerified: null, password: 'victim-hash' }] }) }) }),
  query: { accounts: { findMany: async () => [] } },
  delete: () => ({ where: m.remove }), insert: () => ({ values: async () => undefined }),
 }));
 const response = await POST(new NextRequest('https://plugged.in/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Test User', email: 'victim@example.com', password: 'AttackerPassword123!' }) }));
 expect(response.status).toBe(409);
 expect(m.remove).not.toHaveBeenCalled();
 expect(m.email).not.toHaveBeenCalled();
});
