import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ admin: false, read: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => ({ user: { id: 'user', email: 'recipient@example.com' } }) }));
vi.mock('@/lib/admin-notifications', () => ({ getAdminEmails: () => ['recipient@example.com'] }));
vi.mock('@/lib/services/kubernetes-service', () => ({ kubernetesService: {} }));
vi.mock('@/lib/server-actions/notifications', () => ({ sendNotification: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/db', () => ({ db: {
 query: { users: { findFirst: async () => ({ is_admin: m.admin }) } },
 select: () => ({ from: () => ({ where: () => ({ orderBy: m.read }) }) }),
} }));
import { getAgents } from '@/app/admin/clusters/agent-actions';
import { GET } from '@/app/api/admin/api-keys/route';
beforeEach(() => { vi.clearAllMocks(); m.read.mockResolvedValue([]); });
it.each([false, true])('uses the database admin flag (%s), regardless of notification membership', async (admin) => {
 m.admin = admin;
 expect((await GET(new Request('https://plugged.in/api/admin/api-keys'))).status).toBe(admin ? 200 : 401);
 expect((await getAgents()).success).toBe(admin);
 if (!admin) expect(m.read).not.toHaveBeenCalled();
});
