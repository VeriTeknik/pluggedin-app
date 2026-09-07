import sharp from 'sharp';
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ write: vi.fn(), update: vi.fn() }));
vi.mock('fs/promises', () => ({ default: { mkdir: vi.fn(), writeFile: m.write }, mkdir: vi.fn(), writeFile: m.write }));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => ({ user: { id: 'owner' } }) }));
vi.mock('@/lib/csrf-protection', () => ({ validateCSRF: async () => null }));
vi.mock('@/db', () => ({ db: { update: () => ({ set: m.update }) } }));
import type { NextRequest } from 'next/server';

import { POST } from '@/app/api/settings/avatar/route';
const request = (bytes: Uint8Array, name: string) => ({ formData: async () => ({ get: () => ({ name, type: 'image/png', size: bytes.length, arrayBuffer: async () => bytes }) }) }) as unknown as NextRequest;
beforeEach(() => { vi.clearAllMocks(); m.update.mockReturnValue({ where: async () => undefined }); });
it.each(['payload.html', 'payload.svg'])('rejects executable content disguised as %s', async (name) => {
 const response = await POST(request(Buffer.from('<svg onload="alert(1)"></svg>'), name));
 expect(response.status).toBe(400);
 expect(m.write).not.toHaveBeenCalled();
 expect(m.update).not.toHaveBeenCalled();
});
it.each(['png', 'avif'] as const)('re-encodes a %s raster and derives its public extension on the server', async (format) => {
 const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).toFormat(format).toBuffer();
 const response = await POST(request(png, 'payload.html'));
 expect(response.status).toBe(200);
 const json = await response.json();
 expect(json.image).toMatch(/\.webp$/);
 const written = m.write.mock.calls.find(([file]) => String(file).endsWith('.webp'));
 expect(written).toBeDefined();
 expect((await sharp(written![1]).metadata()).format).toBe('webp');
});
