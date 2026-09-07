import { expect, it, vi } from 'vitest';
const notes = vi.hoisted(() => [] as any[]);
vi.mock('@/app/actions/release-notes', () => ({ getReleaseNotes: async () => ({ notes }) }));
import { GET } from '@/app/api/release-notes/rss/route';
it.each(['body', 'changes'])('removes executable markup from RSS %s', async (kind) => {
 const payload = '<img src=x onerror=alert(1)>';
 notes.splice(0, notes.length, { repository: 'pluggedin-app', version: 'v1', releaseDate: '2026-01-01', content: kind === 'body' ? { body: payload } : { added: [{ message: payload, commitUrl: 'javascript:alert(1)', contributors: [payload] }] } });
 const response = await GET();
 expect(response.status).toBe(200);
 const text = await response.text();
 expect(text).not.toContain(payload);
 expect(text).not.toContain('href="javascript:');
});
