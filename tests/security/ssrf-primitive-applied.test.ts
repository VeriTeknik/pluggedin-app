import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * lib/oauth/ssrf-protection.ts already had the right primitive — validateUrlForSSRF
 * plus safeFetch, which revalidates every redirect hop. It simply was not applied
 * everywhere a URL that a user can influence gets fetched by the server.
 *
 * These are the sites that reach the network with a URL read from the database
 * or from a response header, rather than one written in the source.
 */
const SITES = [
  'app/api/oauth/callback/route.ts',
  'app/api/clusters/[clusterId]/agents/route.ts',
  'lib/oauth/rfc9728-discovery.ts',
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

describe('every server-side fetch of a stored url goes through safeFetch', () => {
  for (const site of SITES) {
    it(`${site} uses safeFetch`, () => {
      const src = stripComments(fs.readFileSync(site, 'utf8'));

      expect(src).toMatch(/safeFetch\s*\(/);
    });

    it(`${site} makes no bare fetch call`, () => {
      const src = stripComments(fs.readFileSync(site, 'utf8'));

      // `await fetch(` / `= fetch(` — a call to the global, as opposed to
      // safeFetch. Matching the bare identifier keeps this readable.
      const bare = src.match(/(?<![.\w])fetch\s*\(/g) ?? [];

      expect(bare).toEqual([]);
    });
  }
});

/**
 * handleMcpRemoteOAuth spawns `npx -y mcp-remote <url>` against a URL taken
 * from the server's own args, and the process manager reflects the child's
 * stdout and stderr back to the caller on failure. Its sibling
 * handleStreamableHttpOAuth validates; this one did not.
 */
describe('the mcp-remote path validates before it spawns', () => {
  it('validates the remote url', () => {
    const src = stripComments(
      fs.readFileSync('app/actions/trigger-mcp-oauth.ts', 'utf8')
    );
    const handler = src.slice(
      src.indexOf('async function handleMcpRemoteOAuth'),
      src.indexOf('async function handleStreamableHttpOAuth')
    );

    expect(handler).toMatch(/validateUrlForSSRF\s*\(/);
  });
});
