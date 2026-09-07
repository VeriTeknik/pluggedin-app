import { NextRequest } from 'next/server';
import { expect, it, vi } from 'vitest';
const keys = vi.hoisted(() => [] as string[]);
vi.mock('ioredis', () => ({ default: class {
 on() {}
 pipeline() {
  const pipeline = { incr: (key: string) => { keys.push(key); return pipeline; }, expire: () => pipeline, exec: async () => [[null, 1], [null, 1]] };
  return pipeline;
 }
} }));
vi.stubEnv('REDIS_URL', '');
import { createRedisRateLimiter } from '@/lib/rate-limiter-redis';
it('keeps forged forwarded prefixes and Cloudflare headers in the same edge-client bucket', async () => {
 const limit = createRedisRateLimiter({ max: 2, windowMs: 60000, failClosed: false, fallbackMultiplier: 1 });
 const results = [];
 for (let n = 0; n < 3; n++) {
  results.push(await limit(new NextRequest('https://plugged.in/api/auth/forgot-password', { headers: {
   'x-forwarded-for': `198.51.100.${n}, 203.0.113.21`, 'cf-connecting-ip': `192.0.2.${n}`, 'x-real-ip': '203.0.113.21',
  } })));
 }
 expect(results.map(r => r.allowed)).toEqual([true, true, false]);
});

it('uses the same trusted client identity for the Redis backend', async () => {
 vi.stubEnv('REDIS_URL', 'redis://unused');
 const limit = createRedisRateLimiter({ max: 3, windowMs: 60000 });
 for (let n = 0; n < 2; n++) await limit(new NextRequest('https://plugged.in/api/auth/reset-password', { headers: {
  'x-forwarded-for': `198.51.100.${n}, 203.0.113.22`, 'cf-connecting-ip': `192.0.2.${n}`,
 } }));
 expect(keys).toHaveLength(2);
 expect(keys[0]).toBe(keys[1]);
 expect(keys[0]).toContain('203.0.113.22');
});
