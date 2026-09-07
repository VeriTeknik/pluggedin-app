import { expect, it, vi } from 'vitest';
const send = vi.hoisted(() => vi.fn(async (_message: { html: string }) => true));
vi.mock('@/lib/email', () => ({ sendEmail: send }));
import { notifyAdmins } from '@/lib/admin-notifications';
it('escapes untrusted names, message text, and metadata in administrative email', async () => {
 vi.stubEnv('ADMIN_NOTIFICATION_EMAILS', 'admin@example.com');
 const payload = '<img src=x onerror=alert(1)>';
 expect(await notifyAdmins({ subject: 'test', title: payload, message: payload, severity: 'ALERT', userDetails: { name: payload, email: payload, id: payload, source: payload }, metadata: { content: payload } })).toBe(true);
 const html = send.mock.calls[0][0].html;
 expect(html).not.toContain(payload);
 expect(html).toContain('&lt;img');
});
