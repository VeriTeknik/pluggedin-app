import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';

import { pinnedLookup } from '@/lib/security/pinned-fetch';
import { isPrivateAddress } from '@/lib/security/validators';

/**
 * A HEAD request that connects only to an address we have checked.
 *
 * Resolving the hostname and then handing the *name* to fetch leaves a window:
 * the name is looked up a second time when the socket is opened, and a name the
 * caller controls can answer differently the second time — pointing the request
 * at loopback or RFC 1918 space after the check said otherwise.
 *
 * node:http and node:https accept a `lookup` of their own, so the socket is
 * given the address that was actually validated while the Host header and the
 * TLS server name stay the hostname. Redirects are not followed: a health check
 * only needs the first hop, and following one would reopen the same window.
 */
export async function pinnedHeadRequest(
  rawUrl: string,
  timeoutMs: number
): Promise<{ status: number } | { error: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { error: 'malformed url' };
  }

  let address: string;
  let family: number;
  try {
    const resolved = await dns.lookup(url.hostname, { all: true });
    const usable = resolved.find((entry) => !isPrivateAddress(entry.address));
    if (!usable) {
      return { error: 'host resolves to a private address' };
    }
    address = usable.address;
    family = usable.family;
  } catch {
    return { error: 'host could not be resolved' };
  }

  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const request = transport.request(
      {
        method: 'HEAD',
        protocol: url.protocol,
        hostname: url.hostname, // keeps Host and the TLS server name
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        timeout: timeoutMs,
        // Hand the socket the address we checked, rather than resolving again.
        lookup: pinnedLookup(address, family),
      },
      (response) => {
        response.resume(); // a HEAD has no body, but the socket must be freed
        resolve({ status: response.statusCode ?? 0 });
      }
    );

    request.on('timeout', () => {
      request.destroy();
      resolve({ error: 'Timeout' });
    });
    request.on('error', (error) => resolve({ error: error.message }));
    request.end();
  });
}
