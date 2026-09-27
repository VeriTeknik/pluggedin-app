import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GitHub owners and npm package names are separate namespaces. When a
 * repository declares a package that is not on npm, detection used to try the
 * unscoped name and then the repository name, and offer whichever existed -
 * labelled as coming from the repository's package.json. Anyone can publish
 * those names. The discovery step then creates a server running that package
 * with the user's configured environment variables.
 */
const m = vi.hoisted(() => ({ fetch: vi.fn(), npm: new Set<string>(), packageJson: null as unknown }));

vi.mock('@/lib/auth', () => ({ getAuthSession: async () => ({ user: { id: 'owner' } }) }));
vi.mock('@/lib/url-validator', () => ({ validateExternalUrl: (url: string) => new URL(url) }));

const { detectPackageConfiguration } = await import('@/app/actions/detect-package');

function githubFile(content: unknown): Response {
  return new Response(
    JSON.stringify({ encoding: 'base64', content: Buffer.from(JSON.stringify(content)).toString('base64') }),
    { status: 200 }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.npm = new Set();
  m.packageJson = null;
  vi.stubGlobal('fetch', m.fetch);
  m.fetch.mockImplementation(async (input: string) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.github.com') {
      if (url.pathname.endsWith('/contents/package.json') && m.packageJson) {
        return githubFile(m.packageJson);
      }
      return new Response('not found', { status: 404 });
    }
    if (url.hostname === 'registry.npmjs.org') {
      const name = decodeURIComponent(url.pathname.slice(1));
      return new Response('{}', { status: m.npm.has(name) ? 200 : 404 });
    }
    return new Response('unexpected', { status: 500 });
  });
});

describe('detectPackageConfiguration - stdio package identity', () => {
  it('does not substitute the unscoped name for an unpublished scoped package', async () => {
    m.packageJson = { name: '@acme/weather-mcp' };
    m.npm = new Set(['weather-mcp']); // somebody else's

    const result = await detectPackageConfiguration('acme', 'weather-mcp-server', ['stdio']);

    expect(JSON.stringify(result)).not.toContain('"weather-mcp"');
    expect(result.stdio?.args ?? []).not.toContain('weather-mcp');
  });

  it('does not substitute the repository name for an unpublished package', async () => {
    m.packageJson = { name: '@acme/weather-mcp' };
    m.npm = new Set(['weather-mcp-server']); // somebody else's

    const result = await detectPackageConfiguration('acme', 'Weather-MCP-Server', ['stdio']);

    expect(result.stdio?.args ?? []).not.toContain('weather-mcp-server');
  });

  it('does not guess the repository name as an npm package when nothing is declared', async () => {
    m.packageJson = null;
    m.npm = new Set(['weather-mcp-server']);

    const result = await detectPackageConfiguration('acme', 'weather-mcp-server', ['stdio']);

    expect(result.stdio?.command).toBeUndefined();
    expect(result.stdio?.args ?? []).not.toContain('weather-mcp-server');
  });

  it('still offers the exact package the repository declares, when it is published', async () => {
    m.packageJson = { name: '@acme/weather-mcp' };
    m.npm = new Set(['@acme/weather-mcp']);

    const result = await detectPackageConfiguration('acme', 'weather-mcp-server', ['stdio']);

    expect(result.stdio).toMatchObject({
      packageName: '@acme/weather-mcp',
      command: 'npx',
      args: ['-y', '@acme/weather-mcp'],
    });
  });
});
