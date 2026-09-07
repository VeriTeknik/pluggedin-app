// @vitest-environment node
import http from 'node:http';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { pinnedFetch } from '@/lib/security/pinned-fetch';
let server: http.Server;
let port: number;
let closed: Promise<void>;
beforeAll(async () => {
 server = http.createServer((req, res) => {
  closed = new Promise(resolve => res.on('close', resolve));
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.write('data: first\n\n');
  if (req.url === '/large') res.end('x'.repeat(100));
 });
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 port = (server.address() as { port: number }).port;
});
afterAll(() => { server.closeAllConnections(); server.close(); });
it('delivers SSE before EOF and cancels the upstream connection', async () => {
 const response = await pinnedFetch(new URL(`http://unresolved.invalid:${port}/`), undefined, '127.0.0.1', 4, { stream: true, timeoutMs: 300 });
 const reader = response.body!.getReader();
 expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: first\n\n');
 await reader.cancel();
 await closed;
});
it('propagates the response size limit into the stream', async () => {
 const response = await pinnedFetch(new URL(`http://unresolved.invalid:${port}/large`), undefined, '127.0.0.1', 4, { stream: true, maxBytes: 50 });
 await expect(response.text()).rejects.toThrow(/too large/);
});
it('aborts an already opened SSE response', async () => {
 const controller = new AbortController();
 const response = await pinnedFetch(new URL(`http://unresolved.invalid:${port}/`), { signal: controller.signal }, '127.0.0.1', 4, { stream: true, timeoutMs: 300 });
 const reader = response.body!.getReader();
 await reader.read();
 controller.abort(new Error('stop stream'));
 await expect(reader.read()).rejects.toThrow(/stop stream/);
 await closed;
});
