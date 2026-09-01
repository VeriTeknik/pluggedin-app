import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const convertMcpToLangchainTools = vi.fn(async () => ({ tools: [], cleanup: async () => {} }));
const addServerLogForProfile = vi.fn(async () => {});
const fetchSpy = vi.fn(async () => ({ ok: true, status: 200 }));

const lookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);

vi.mock('@h1deya/langchain-mcp-tools', () => ({ convertMcpToLangchainTools }));
vi.mock('node:dns/promises', () => ({ default: { lookup }, lookup }));
vi.mock('@/app/actions/mcp-playground', () => ({ addServerLogForProfile }));

vi.stubGlobal('fetch', fetchSpy);

const { progressivelyInitializeMcpServers } = await import('@/lib/mcp/progressive-initialization');

beforeEach(() => {
  vi.clearAllMocks();
  fetchSpy.mockResolvedValue({ ok: true, status: 200 } as never);
  lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
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

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never fetches a private address', async () => {
    await run('http://10.0.0.5:8080/');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never fetches a non-http scheme', async () => {
    await run('file:///etc/passwd');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still checks a public url', async () => {
    await run('https://mcp.example.com/sse');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://mcp.example.com/sse',
      expect.objectContaining({ method: 'HEAD' })
    );
  });

  it('refuses a public hostname that resolves to a private address', async () => {
    // Validating the hostname string is not enough: a name the attacker
    // controls can simply be pointed at 127.0.0.1 or 10.0.0.0/8.
    lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);

    await run('https://totally-public.example.com/sse');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not follow redirects', async () => {
    // An initially public url can redirect into the private network, and fetch
    // follows redirects by default.
    await run('https://mcp.example.com/sse');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://mcp.example.com/sse',
      expect.objectContaining({ redirect: 'manual' })
    );
  });

  it('counts a redirect as reachable without following it', async () => {
    // `redirect: 'manual'` makes response.ok false for a 3xx, so a server that
    // legitimately redirects would be marked unhealthy and skipped. The check
    // only asks whether the endpoint is alive, and a 3xx answers that.
    fetchSpy.mockResolvedValue({ ok: false, status: 302 } as never);

    const result = await run('https://mcp.example.com/sse');

    expect(result.initStatus.find((s) => s.serverName === 'probe')?.status).not.toBe('skipped');
  });
});
