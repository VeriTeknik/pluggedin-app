import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * lib/oauth/ssrf-protection.ts already had the right primitive — validateUrlForSSRF
 * plus safeFetch, which revalidates every redirect hop. It simply was not applied
 * everywhere a URL that a user can influence gets fetched by the server.
 *
 * These are the sites that reach the network with a URL read from the database
 * or from a response header, rather than one written in the source.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

/**
 * Values that name a network destination and are read from storage or from a
 * response, rather than written in the source. A bare `fetch` in the same file
 * as one of these is the shape this rule is about.
 */
const STORED_DESTINATIONS =
  /\b(collector_url|token_endpoint|callback_url|metadataUrl|authorization_server|server\.url|remoteUrl|validated\.url|callbackUrl)\b/;

/**
 * The one site that cannot be fixed by applying safeFetch, listed here rather
 * than left to slip through a pattern that happens not to match it.
 *
 * app/api/mcp/oauth/callback forwards to oauthSession.callback_url, which has
 * to be on loopback, because the listener it serves is local — so safeFetch
 * would refuse the call outright and break the flow. It is narrowed instead, at
 * both ends, to a local OAuth listener (http, loopback host, port 1024-65535,
 * /oauth/callback, only code/state/iss forwarded, owner of the flow only): by
 * the route before it forwards, and by StreamableHTTPWrapper before it stores
 * the URL (lib/mcp/transports/oauth-callback-listener.ts). What stays open is
 * the port: it comes from the intercepted request, not from an allocation the
 * app made for that session, and mcp_oauth_sessions records none. Its fetch
 * argument is `listener`, which the pattern below would not catch, so it stays
 * listed rather than passing unexamined.
 */
const KNOWN_UNFIXED = ['app/api/mcp/oauth/callback/route.ts'];

describe('every server-side fetch of a stored url goes through safeFetch', () => {
  /**
   * Discovered, not listed. My first version of this test enumerated the files
   * I had just fixed, so it passed while the sibling route
   * app/api/clusters/[clusterId]/agents/[agentId]/route.ts — the same
   * collector_url, one directory down — still used a bare fetch. A test that
   * only knows the files you already thought of cannot tell you about the one
   * you missed.
   */
  it('no file naming a stored destination still calls fetch directly', () => {
    const offenders = ['app', 'lib']
      .flatMap((dir) => walk(dir))
      .filter((file) => !KNOWN_UNFIXED.includes(file))
      .filter((file) => {
        const src = stripComments(fs.readFileSync(file, 'utf8'));

        // The destination has to be in the call's own argument. Matching the
        // file as a whole flagged lib/mcp/package-detector.ts, which fetches
        // registry.npmjs.org and api.github.com — constant hosts — and merely
        // mentions one of these names elsewhere.
        for (const match of src.matchAll(/(?<![.\w])fetch\s*\(/g)) {
          const argument = src.slice(match.index ?? 0, (match.index ?? 0) + 160);
          if (STORED_DESTINATIONS.test(argument)) return true;
        }

        return false;
      });

    expect(offenders).toEqual([]);
  });
});

/**
 * handleMcpRemoteOAuth spawns `npx -y mcp-remote <url>` against a URL taken
 * from the server's own args, and the process manager reflects the child's
 * stdout and stderr back to the caller on failure. Its sibling
 * handleStreamableHttpOAuth validates; this one did not.
 */
describe('the mcp-remote path validates before it spawns', () => {
  it('validates the remote url, and does so before the process is launched', () => {
    // Asserting only that the call exists would pass if it moved below the
    // spawn, which is where it would stop protecting anything.
    const src = stripComments(fs.readFileSync('app/actions/trigger-mcp-oauth.ts', 'utf8'));
    const handler = src.slice(
      src.indexOf('async function handleMcpRemoteOAuth'),
      src.indexOf('async function handleStreamableHttpOAuth')
    );

    const validatedAt = handler.search(/validateUrlForSSRF\s*\(/);
    const spawnedAt = handler.search(/oauthProcessManager\.triggerOAuth\s*\(/);

    expect(validatedAt).toBeGreaterThanOrEqual(0);
    expect(spawnedAt).toBeGreaterThanOrEqual(0);
    expect(validatedAt).toBeLessThan(spawnedAt);
  });
});

