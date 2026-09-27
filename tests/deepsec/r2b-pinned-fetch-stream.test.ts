// @vitest-environment node
/**
 * Streamed MCP responses (safeMcpFetch -> safeFetch -> pinnedFetch stream mode)
 * inherited the limits written for one-shot buffered requests:
 *
 * - The inactivity timeout was the socket's idle timer for the whole life of
 *   the request, so a quiet SSE stream (the SSE transport's GET carrying every
 *   response, or Streamable HTTP's notification GET) was destroyed after 30 s
 *   of the user doing nothing, and a tool that took longer than that to send
 *   its first byte failed.
 * - The byte cap counted every byte the stream ever carried, so a session died
 *   after 10 MB in total, however small each message was.
 *
 * Stream mode now bounds the wait for the response headers (configurable,
 * about 300 s by default, as undici does), then leaves the body to the caller's
 * AbortSignal, and caps what has to be held at once: one SSE event, or the
 * whole body when it is a single message such as JSON. Buffered mode is
 * unchanged.
 */
import http from 'node:http';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { pinnedFetch } from '@/lib/security/pinned-fetch';

let server: http.Server;
let port: number;
const timers = new Set<NodeJS.Timeout>();
const later = (ms: number, fn: () => void) => {
  const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms);
  timers.add(timer);
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    switch (req.url) {
      case '/quiet-after-first-event':
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: first\n\n');
        later(700, () => res.end('data: second\n\n'));
        return;
      case '/quiet-after-headers':
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.flushHeaders();
        later(700, () => res.end('data: late\n\n'));
        return;
      case '/slow-headers':
        // A tool call that takes a while before the server answers at all.
        later(700, () => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"ok":true}');
        });
        return;
      case '/never-answers':
        return;
      case '/many-small-events': {
        // 12 MB in 4 KB events: more than the default 10 MB cap in total,
        // nowhere near it per event.
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const event = `data: ${'x'.repeat(4096 - 8)}\n\n`;
        let sent = 0;
        const pump = () => {
          while (sent < 12 * 1024 * 1024) {
            sent += event.length;
            if (!res.write(event)) { res.once('drain', pump); return; }
          }
          res.end();
        };
        pump();
        return;
      }
      case '/one-huge-event':
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: small\n\n');
        for (let i = 0; i < 20; i++) res.write(`data: ${'y'.repeat(100)}\n`);
        res.end('\n');
        return;
      case '/big-json': {
        res.writeHead(200, { 'content-type': 'application/json' });
        for (let i = 0; i < 20; i++) res.write('z'.repeat(100));
        res.end();
        return;
      }
      default:
        res.writeHead(404);
        res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  for (const timer of timers) clearTimeout(timer);
  server.closeAllConnections();
  server.close();
});

const url = (path: string) => new URL(`http://unresolved.invalid:${port}${path}`);
const stream = (path: string, limits: { maxBytes?: number; timeoutMs?: number } = {}, init?: RequestInit) =>
  pinnedFetch(url(path), init, '127.0.0.1', 4, { stream: true, ...limits });

describe('pinnedFetch stream mode: time', () => {
  it('keeps an SSE stream open while it is quiet after an event', async () => {
    const response = await stream('/quiet-after-first-event', { timeoutMs: 200 });
    await expect(response.text()).resolves.toBe('data: first\n\ndata: second\n\n');
  });

  it('keeps an SSE stream open while it is quiet after the headers', async () => {
    const response = await stream('/quiet-after-headers', { timeoutMs: 200 });
    await expect(response.text()).resolves.toBe('data: late\n\n');
  });

  it('still gives up on a server that never sends headers', async () => {
    await expect(stream('/never-answers', { timeoutMs: 200 })).rejects.toThrow(/timed out/i);
  });

  it('waits for slow headers when the headers timeout allows it', async () => {
    const response = await stream('/slow-headers', { timeoutMs: 2000 });
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('waits about 300 s for headers by default in stream mode, and 30 s when buffered', async () => {
    const spy = vi.spyOn(http, 'request');

    await (await stream('/slow-headers')).text();
    await (await pinnedFetch(url('/slow-headers'), undefined, '127.0.0.1', 4)).text();

    const timeouts = spy.mock.calls.map((call) => (call[0] as http.RequestOptions).timeout);
    expect(timeouts).toEqual([300_000, 30_000]);
  });

  it('ends a quiet stream when the caller aborts', async () => {
    const controller = new AbortController();
    const response = await stream('/quiet-after-headers', { timeoutMs: 200 }, { signal: controller.signal });
    const reader = response.body!.getReader();
    const pending = reader.read();
    controller.abort(new Error('caller stopped'));
    await expect(pending).rejects.toThrow(/caller stopped/);
  });
});

describe('pinnedFetch stream mode: size', () => {
  it('lets a long SSE session carry more than the cap in total', async () => {
    const response = await stream('/many-small-events');
    const reader = response.body!.getReader();
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
    }
    expect(total).toBeGreaterThan(10 * 1024 * 1024);
  }, 30_000);

  it('still refuses a single SSE event larger than the cap', async () => {
    const response = await stream('/one-huge-event', { maxBytes: 1000 });
    await expect(response.text()).rejects.toThrow(/too large/i);
  });

  it('still refuses a streamed JSON body larger than the cap, since it is one message', async () => {
    const response = await stream('/big-json', { maxBytes: 1000 });
    await expect(response.text()).rejects.toThrow(/too large/i);
  });
});
