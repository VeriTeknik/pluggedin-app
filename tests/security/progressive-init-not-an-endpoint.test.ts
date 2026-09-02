import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const convertMcpToLangchainTools = vi.fn(async () => ({ tools: [], cleanup: async () => {} }));
const addServerLogForProfile = vi.fn(async () => {});

const lookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);
const request = vi.fn();

vi.mock('@h1deya/langchain-mcp-tools', () => ({ convertMcpToLangchainTools }));
vi.mock('node:dns/promises', () => ({ default: { lookup }, lookup }));
vi.mock('node:https', () => ({ default: { request }, request }));
vi.mock('node:http', () => ({ default: { request }, request }));
vi.mock('@/app/actions/mcp-playground', () => ({ addServerLogForProfile }));

/** A node:https request that answers with `status` and never touches a socket. */
function respondWith(status: number) {
  request.mockImplementation((_options: any, onResponse: any) => {
    queueMicrotask(() => onResponse({ statusCode: status, resume() {} }));
    return { on: () => {}, end: () => {}, destroy: () => {} };
  });
}

const { progressivelyInitializeMcpServers } = await import('@/lib/mcp/progressive-initialization');

beforeEach(() => {
  vi.clearAllMocks();
  lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  respondWith(200);
});

/** A mention in a comment is not a reference. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

/**
 * progressivelyInitializeMcpServers sat in a `'use server'` module, so it was a
 * public POST endpoint. It took `mcpServersConfig` straight from its caller and
 * handed it to convertMcpToLangchainTools, which spawns `command` with `args`
 * as a child process. That is arbitrary command execution with no session.
 *
 * Its only caller builds the config server-side from the database, so it never
 * needed to be an endpoint at all.
 */
describe('the config-taking initializer is not an HTTP endpoint', () => {
  it('is not declared in a use-server module', () => {
    const src = fs.readFileSync('lib/mcp/progressive-initialization.ts', 'utf8');

    expect(/^['"]use server['"]/.test(src.trimStart())).toBe(false);
  });

  it('no server-action module calls the process spawner itself', () => {
    // Deliberately a direct check, not a transitive one. app/actions/mcp-playground.ts
    // *does* reach the spawner through this module, and must: that is the whole
    // feature. What matters is that the function taking an `mcpServersConfig`
    // from its caller is not itself an endpoint, so the config crossing the
    // network boundary is a list of server uuids rather than a command line.
    const offenders = walk('app/actions').filter((file) =>
      /convertMcpToLangchainTools/.test(stripComments(fs.readFileSync(file, 'utf8')))
    );

    expect(offenders).toEqual([]);
  });
});

/**
 * The health check fetched `config.url` with no scheme or host validation, and
 * fetch follows redirects. Reachability was reported back through the server
 * log, making it a usable probe of the private network.
 */
describe('the health check does not probe the private network', () => {
  const run = (url: string) =>
    progressivelyInitializeMcpServers(
      { probe: { type: 'SSE', url } },
      'profile-1',
      { logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } }
    );

  it('never fetches the cloud metadata endpoint', async () => {
    await run('http://169.254.169.254/latest/meta-data/');

    expect(request).not.toHaveBeenCalled();
  });

  it('never fetches a private address', async () => {
    await run('http://10.0.0.5:8080/');

    expect(request).not.toHaveBeenCalled();
  });

  it('never fetches a non-http scheme', async () => {
    await run('file:///etc/passwd');

    expect(request).not.toHaveBeenCalled();
  });

  it('still checks a public url', async () => {
    await run('https://mcp.example.com/sse');

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'HEAD', hostname: 'mcp.example.com' }),
      expect.any(Function)
    );
  });

  it('refuses a public hostname that resolves to a private address', async () => {
    // Validating the hostname string is not enough: a name the attacker
    // controls can simply be pointed at 127.0.0.1 or 10.0.0.0/8.
    lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);

    await run('https://totally-public.example.com/sse');

    expect(request).not.toHaveBeenCalled();
  });

  it('pins the checked address to the socket', async () => {
    // Handing fetch the hostname would resolve it a second time when the socket
    // opens, so a controlled name can answer differently between the check and
    // the connection. node:https takes the address through its own `lookup`,
    // while Host and the TLS server name stay the hostname.
    await run('https://mcp.example.com/sse');

    const options = request.mock.calls[0][0];
    expect(options.hostname).toBe('mcp.example.com');

    const pinned = await new Promise((resolve) =>
      options.lookup('mcp.example.com', {}, (_e: unknown, address: string) => resolve(address))
    );
    expect(pinned).toBe('93.184.216.34');
  });

  it('opens exactly one connection, so nothing follows a redirect', async () => {
    respondWith(302);

    await run('https://mcp.example.com/sse');

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('counts a redirect as reachable without following it', async () => {
    // A server that legitimately redirects must not be marked unhealthy and
    // skipped. The check only asks whether the endpoint is alive.
    respondWith(302);

    const result = await run('https://mcp.example.com/sse');

    expect(result.initStatus.find((s) => s.serverName === 'probe')?.status).not.toBe('skipped');
  });

  it.each([
    ['100.64.0.1', 'carrier-grade NAT'],
    ['224.0.0.1', 'IPv4 multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'broadcast'],
    ['192.0.2.1', 'TEST-NET-1'],
    ['198.18.0.1', 'benchmarking'],
    ['ff02::1', 'IPv6 multicast'],
    ['::ffff:10.0.0.1', 'IPv4-mapped private'],
  ])('refuses %s (%s)', async (address) => {
    // Blocking only RFC 1918 and loopback leaves plenty of non-public space to
    // aim at. Anything not globally routable is refused.
    lookup.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }]);

    await run('https://looks-fine.example.com/sse');

    expect(request).not.toHaveBeenCalled();
  });
});
