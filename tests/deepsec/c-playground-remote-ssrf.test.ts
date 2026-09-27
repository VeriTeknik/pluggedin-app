import fs from 'node:fs';
import { Readable } from 'node:stream';

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Playground connections to remote MCP servers bypassed the protected
 * transports (deepsec pluggedin-app-ssrf-c83fb86a1a, app/actions/mcp-playground.ts,
 * and pluggedin-app-ssrf-f9677f8b73, lib/mcp/progressive-initialization.ts).
 *
 * getOrCreatePlaygroundSession hands each selected server to
 * progressivelyInitializeMcpServers, which passes it to
 * @h1deya/langchain-mcp-tools. That library builds its own MCP SDK transports
 * and offers no way to give them a fetch, so every request — initialize, the
 * SSE GET, each tools/call — went to plain global fetch: the hostname resolved
 * by fetch itself, private addresses allowed, redirects followed unchecked.
 * Streamable HTTP servers skipped even the pinned health check. A user could
 * save `https://internal.attacker.example/mcp` resolving to 10.0.0.5, open the
 * playground, and have the server call into its own network.
 *
 * These tests run the real library and the real SDK. Only DNS and the socket
 * layer are faked, and global fetch is a tripwire: nothing may reach it.
 */

const m = vi.hoisted(() => ({
  lookup: vi.fn(),
  request: vi.fn(),
  rawFetch: vi.fn(),
  calls: [] as Array<{ method: string; rpc?: string }>,
}));

vi.mock('node:dns/promises', () => ({ default: { lookup: m.lookup }, lookup: m.lookup }));
vi.mock('node:https', () => ({ default: { request: m.request }, request: m.request }));
vi.mock('node:http', () => ({ default: { request: m.request }, request: m.request }));
vi.mock('@/app/actions/mcp-playground', () => ({ addServerLogForProfile: vi.fn(async () => {}) }));

const { progressivelyInitializeMcpServers } = await import('@/lib/mcp/progressive-initialization');

const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

/** The config exactly as getOrCreatePlaygroundSession builds it for a STREAMABLE_HTTP server. */
function playgroundConfig(url: string) {
  return {
    command: null,
    args: [],
    env: {},
    url,
    type: 'STREAMABLE_HTTP',
    uuid: 'server-uuid',
    config: undefined,
    transport: 'streamable_http',
  };
}

/** A minimal Streamable HTTP MCP server behind the mocked socket layer. */
function answer(method: string, body: string) {
  if (method === 'GET') return { status: 405, headers: {}, body: '' };
  const message = JSON.parse(body);
  m.calls.push({ method, rpc: message.method });
  if (message.id === undefined) return { status: 202, headers: {}, body: '' };

  const result =
    message.method === 'initialize'
      ? {
          protocolVersion: message.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: 'fake', version: '1.0.0' },
        }
      : message.method === 'tools/list'
        ? {
            tools: [
              {
                name: 'echo',
                description: 'echo',
                inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
              },
            ],
          }
        : { content: [{ type: 'text', text: 'pong' }] };

  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: message.id, result }),
  };
}

function fakeServer() {
  m.request.mockImplementation((options: any, onResponse: (response: any) => void) => {
    let body = '';
    const req: any = {
      on: () => req,
      write: (chunk: string) => {
        body += chunk;
      },
      end: () => {
        queueMicrotask(() => {
          const reply = answer(options.method, body);
          onResponse(
            Object.assign(Readable.from(reply.body ? [Buffer.from(reply.body)] : []), {
              statusCode: reply.status,
              statusMessage: '',
              headers: reply.headers,
            })
          );
        });
      },
      destroy: () => {},
    };
    return req;
  });
}

function run(url: string) {
  return progressivelyInitializeMcpServers({ remote: playgroundConfig(url) }, 'profile-1', {
    logger,
    perServerTimeout: 5000,
    totalTimeout: 10000,
    maxRetries: 0,
    llmProvider: 'anthropic',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.calls.length = 0;
  vi.stubGlobal('fetch', m.rawFetch);
  m.rawFetch.mockResolvedValue(new Response('{}', { status: 500 }));
  m.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  fakeServer();
});

describe('remote playground servers connect only through the protected fetch', () => {
  it('never connects to a Streamable HTTP host that resolves to a private address', async () => {
    m.lookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

    const result = await run('https://internal.attacker.example/mcp');

    expect(m.rawFetch).not.toHaveBeenCalled();
    expect(m.request).not.toHaveBeenCalled();
    expect(result.failedServers).toContain('remote');
  });

  it('never connects to cloud metadata, whatever the name resolves to', async () => {
    m.lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);

    await run('http://metadata.attacker.example/latest/meta-data/');

    expect(m.rawFetch).not.toHaveBeenCalled();
    expect(m.request).not.toHaveBeenCalled();
  });

  it('refuses a private literal before any connection is attempted', async () => {
    const result = await run('http://10.0.0.5:8080/mcp');

    expect(m.rawFetch).not.toHaveBeenCalled();
    expect(m.request).not.toHaveBeenCalled();
    expect(result.failedServers).toContain('remote');
  });

  it('connects to a public server over the pinned address and keeps tool calls on it', async () => {
    const result = await run('https://mcp.example.com/mcp');

    expect(result.failedServers).toEqual([]);
    expect(result.tools.map((tool: { name: string }) => tool.name)).toEqual(['echo']);

    // The socket got the checked address; Host and SNI stay the name.
    const options = m.request.mock.calls[0][0];
    expect(options.hostname).toBe('mcp.example.com');
    const pinned = await new Promise((resolve) =>
      options.lookup('mcp.example.com', {}, (_e: unknown, address: string) => resolve(address))
    );
    expect(pinned).toBe('93.184.216.34');

    // A tool call happens long after initialization returned — it must still
    // go through the protected path, not the global fetch.
    const before = m.request.mock.calls.length;
    await expect(result.tools[0].invoke({ text: 'ping' })).resolves.toBe('pong');
    expect(m.request.mock.calls.length).toBeGreaterThan(before);
    expect(m.calls.some((call) => call.rpc === 'tools/call')).toBe(true);

    await result.cleanup();
    expect(m.rawFetch).not.toHaveBeenCalled();
  });

  it('the playground reaches remote servers only through the protected initializer', () => {
    // Comments stripped: a mention is not a use.
    const src = fs
      .readFileSync('app/actions/mcp-playground.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');

    expect(src).toMatch(/progressivelyInitializeMcpServers\s*\(/);
    expect(src).not.toMatch(
      /convertMcpToLangchainTools|StreamableHTTPClientTransport|SSEClientTransport|(?<![.\w])fetch\s*\(/
    );
  });

  it('leaves fetches made outside an MCP connection alone', async () => {
    await run('https://mcp.example.com/mcp');

    await fetch('https://api.example.org/unrelated');

    expect(m.rawFetch.mock.calls.map(([target]) => String(target))).toEqual([
      'https://api.example.org/unrelated',
    ]);
  });
});
