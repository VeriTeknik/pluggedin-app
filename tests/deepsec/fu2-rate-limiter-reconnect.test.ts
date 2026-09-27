/**
 * Both Redis-backed rate limiters told ioredis to stop reconnecting after three
 * attempts (retryStrategy returned null). One Redis restart then broke rate
 * limiting until the app itself restarted:
 *
 * - lib/rate-limiter-redis.ts fails closed in production, so every limited
 *   route (the memory API, agents) answered 429 until a redeploy;
 * - lib/rate-limiter.ts treats a disconnected client as "no entry", so every
 *   request opened a fresh window: the auth / sensitive limiters stopped
 *   limiting at all.
 *
 * Now the client keeps reconnecting with capped backoff. While Redis is down,
 * lib/rate-limiter-redis.ts still fails closed (without queueing requests
 * behind reconnect attempts) and lib/rate-limiter.ts limits per instance from
 * memory; both go back to Redis once it is ready again.
 *
 * No Redis is contacted: ioredis is replaced for both the ESM import and the
 * CommonJS require lib/rate-limiter.ts uses.
 */
import { createRequire } from 'node:module';

import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;

  class FakeRedis {
    static instances: FakeRedis[] = [];
    options: Record<string, unknown>;
    status = 'wait';
    up = true;
    commands = 0;
    store = new Map<string, string>();
    handlers: Record<string, Handler[]> = {};

    constructor(_url: string, options: Record<string, unknown>) {
      this.options = options;
      FakeRedis.instances.push(this);
    }

    on(event: string, handler: Handler) {
      (this.handlers[event] ??= []).push(handler);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      for (const handler of this.handlers[event] ?? []) handler(...args);
    }

    ready() {
      this.up = true;
      this.status = 'ready';
      this.emit('connect');
      this.emit('ready');
    }

    outage() {
      this.up = false;
      this.status = 'reconnecting';
      this.emit('error', new Error('connect ECONNREFUSED'));
      this.emit('close');
      this.emit('reconnecting', 50);
    }

    private command() {
      this.commands++;
      if (!this.up) throw new Error('Connection is closed.');
    }

    // lib/rate-limiter.ts
    async get(key: string) {
      this.command();
      return this.store.get(key) ?? null;
    }
    async setex(key: string, _ttl: number, value: string) {
      this.command();
      this.store.set(key, value);
    }

    // lib/rate-limiter-redis.ts
    pipeline() {
      let key = '';
      const pipeline = {
        incr: (k: string) => ((key = k), pipeline),
        expire: () => pipeline,
        exec: async () => {
          this.command();
          const count = Number(this.store.get(key) ?? 0) + 1;
          this.store.set(key, String(count));
          return [
            [null, count],
            [null, 1],
          ];
        },
      };
      return pipeline;
    }
  }

  return { FakeRedis };
});

vi.mock('ioredis', () => ({ default: fake.FakeRedis }));

const nodeRequire = createRequire(import.meta.url);
const ioredisPath = nodeRequire.resolve('ioredis');
const originalRedisUrl = process.env.REDIS_URL;

beforeAll(() => {
  nodeRequire.cache[ioredisPath] = {
    id: ioredisPath,
    filename: ioredisPath,
    loaded: true,
    exports: fake.FakeRedis,
  } as never;
});

afterAll(() => {
  delete nodeRequire.cache[ioredisPath];
  if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = originalRedisUrl;
});

beforeEach(() => {
  vi.resetModules();
  fake.FakeRedis.instances = [];
  process.env.REDIS_URL = 'redis://redis.invalid:6379';
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

function request(path: string) {
  return new NextRequest(`http://localhost${path}`, { headers: { 'x-forwarded-for': '203.0.113.7' } });
}

function expectKeepsReconnecting(options: Record<string, unknown>) {
  const retryStrategy = options.retryStrategy as (times: number) => number | null | void;
  let previous = 0;
  for (const times of [1, 2, 3, 4, 5, 10, 100, 10_000, 1_000_000]) {
    const delay = retryStrategy(times);
    expect(typeof delay, `retryStrategy(${times})`).toBe('number');
    expect(delay as number).toBeGreaterThan(0);
    expect(delay as number).toBeLessThanOrEqual(5_000);
    expect(delay as number).toBeGreaterThanOrEqual(previous);
    previous = delay as number;
  }
}

describe('lib/rate-limiter.ts', () => {
  async function load() {
    const mod = await import('@/lib/rate-limiter');
    const client = fake.FakeRedis.instances.at(-1)!;
    expect(client).toBeDefined();
    return { ...mod, client };
  }

  it('never stops reconnecting, and backs off to a cap', async () => {
    const { client } = await load();

    expectKeepsReconnecting(client.options);
  });

  it('keeps limiting from memory while Redis is down, then returns to Redis', async () => {
    const { createRateLimiter, client } = await load();
    const limit = createRateLimiter({ windowMs: 60_000, max: 2 });
    client.ready();

    expect((await limit(request('/a'))).allowed).toBe(true);
    expect((await limit(request('/a'))).allowed).toBe(true);
    expect((await limit(request('/a'))).allowed).toBe(false);

    client.outage();
    const results = [];
    for (let i = 0; i < 3; i++) results.push((await limit(request('/b'))).allowed);
    expect(results).toEqual([true, true, false]);

    client.ready();
    const before = client.commands;
    expect((await limit(request('/c'))).allowed).toBe(true);
    expect(client.commands).toBeGreaterThan(before);
  });
});

describe('lib/rate-limiter-redis.ts', () => {
  async function load() {
    const mod = await import('@/lib/rate-limiter-redis');
    return mod;
  }

  it('never stops reconnecting, and backs off to a cap', async () => {
    const { createRedisRateLimiter } = await load();
    await createRedisRateLimiter({ windowMs: 60_000, max: 5, failClosed: true })(request('/m'));
    const client = fake.FakeRedis.instances.find((c) => 'lazyConnect' in c.options && c.options.lazyConnect === true)!;

    expectKeepsReconnecting(client.options);
  });

  it('fails closed during an outage without sending commands, and recovers when Redis is back', async () => {
    const { createRedisRateLimiter } = await load();
    const limit = createRedisRateLimiter({ windowMs: 60_000, max: 5, failClosed: true });

    expect((await limit(request('/m'))).allowed).toBe(true);
    const client = fake.FakeRedis.instances.find((c) => c.options.lazyConnect === true)!;
    client.ready();
    expect((await limit(request('/m'))).allowed).toBe(true);

    client.outage();
    const during = client.commands;
    const denied = await limit(request('/m'));
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBeGreaterThan(0);
    expect(client.commands).toBe(during);

    client.ready();
    expect((await limit(request('/m'))).allowed).toBe(true);
    expect(client.commands).toBeGreaterThan(during);
  });

  it('also fails fast when Redis was unreachable from the start', async () => {
    const { createRedisRateLimiter } = await load();
    const limit = createRedisRateLimiter({ windowMs: 60_000, max: 5, failClosed: true });

    // The first request rides the initial (lazy) connection attempt, which fails.
    await limit(request('/m'));
    const client = fake.FakeRedis.instances.find((c) => c.options.lazyConnect === true)!;
    client.outage();

    const during = client.commands;
    expect((await limit(request('/m'))).allowed).toBe(false);
    expect(client.commands).toBe(during);

    client.ready();
    expect((await limit(request('/m'))).allowed).toBe(true);
  });
});
