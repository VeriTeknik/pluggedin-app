import { expect, it, vi } from 'vitest';
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => null }));
vi.mock('@/db', () => ({ db: { query: { sharedMcpServersTable: { findMany: async () => [{ created_at: new Date(), template: { env: { KEY: 'SECRET-TEMPLATE' }, streamableHTTPOptions: { oauth: { accessToken: 'SECRET-OAUTH', refreshToken: 'SECRET-REFRESH', clientSecret: 'SECRET-CLIENT' }, enableResumption: true } }, server: { uuid: 'server', command: 'npx', args: ['mcp', '--token', 'SECRET-ARG'], url: 'https://example.com/mcp?api_key=SECRET-URL' } }] } } } }));
import { NextRequest } from 'next/server';

import { GET } from '@/app/api/profile/[profileId]/shared-servers/route';
it('sanitizes both stored templates and live server connection fields on public reads', async () => {
 const response = await GET(new NextRequest('https://plugged.in/api/profile/profile/shared-servers'), { params: Promise.resolve({ profileId: 'profile' }) });
 expect(response.status).toBe(200);
 const data = await response.json();
 expect(data[0].server.uuid).toBe('server');
 expect(JSON.stringify(data)).not.toContain('SECRET-');
});
