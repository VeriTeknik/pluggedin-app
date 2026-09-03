/**
 * SSRF (Server-Side Request Forgery) Protection
 * Validates URLs to prevent access to private networks and reserved IP ranges
 */

import dns from 'node:dns/promises';

import { pinnedFetch } from '@/lib/security/pinned-fetch';
import { ipLiteralFromHost, isPrivateAddress } from '@/lib/security/validators';

/**
 * Check if a hostname is a private or reserved IP address
 * Prevents SSRF attacks against internal services
 */
function isPrivateOrReservedIP(hostname: string): boolean {
  // A trailing dot root-qualifies a name: `localhost.` and `localhost` reach
  // the same place, but only one of them matched a string comparison.
  const host = hostname.toLowerCase().replace(/\.+$/, '');

  // Names that mean the local machine. Every other name is a name, not an
  // address — assertHostResolvesPublic below is what judges those.
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }

  // One classifier for both families, shared with the socket-level check, and
  // decided on the parsed address. The list this replaces compared the
  // hostname against '::1' and matched `/^::ffff:127\./` — but a URL hostname
  // is bracketed (`[::1]`) and WHATWG canonicalises IPv4-mapped addresses to
  // hex (`[::ffff:7f00:1]`), so neither pattern could ever fire
  // (GHSA-gmhc-h765-37cg).
  const literal = ipLiteralFromHost(host);
  return literal !== null && isPrivateAddress(literal);
}

/**
 * Validate URL to prevent SSRF attacks
 * Throws error if URL points to private/reserved networks
 *
 * @param url - URL string to validate
 * @param allowPrivate - Allow private IPs (default: false) - use ONLY for testing
 * @throws Error if URL is invalid or points to restricted network
 */
export function validateUrlForSSRF(url: string, allowPrivate = false): URL {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw new Error('Invalid URL format');
  }

  // Only allow HTTP(S) protocols
  if (!parsedUrl.protocol.match(/^https?:$/)) {
    throw new Error('Only HTTP and HTTPS protocols are allowed');
  }

  // Check for private/reserved IPs unless explicitly allowed
  if (!allowPrivate && isPrivateOrReservedIP(parsedUrl.hostname)) {
    throw new Error(
      'Access to private or reserved IP ranges is not allowed for security reasons'
    );
  }

  // Additional security checks

  // Prevent URLs with credentials (username:password@host)
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('URLs with embedded credentials are not allowed');
  }

  // Warn about unusual ports (but allow them)
  const port = parsedUrl.port;
  if (port && !allowPrivate) {
    const portNum = parseInt(port, 10);
    // Flag suspicious ports commonly used for internal services
    const suspiciousPorts = [
      22, // SSH
      23, // Telnet
      25, // SMTP
      3306, // MySQL
      5432, // PostgreSQL
      6379, // Redis
      27017, // MongoDB
    ];

    if (suspiciousPorts.includes(portNum)) {
      throw new Error(
        `Port ${portNum} is commonly used for internal services and is not allowed`
      );
    }
  }

  return parsedUrl;
}

/** Redirect hops followed before giving up. Matches the fetch spec's default. */
const MAX_REDIRECTS = 20;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Safe fetch with SSRF protection.
 *
 * Validates the URL **on every hop**, not just the first. fetch follows
 * redirects by default, so validating only the initial URL left the guard
 * trivially bypassable: a public host answering `302 Location:
 * http://169.254.169.254/` would be followed straight into cloud metadata. The
 * redirect is therefore handled here (`redirect: 'manual'`) and each Location
 * is re-validated before it is followed.
 *
 * Relative Locations are resolved against the current URL first, since a bare
 * `/internal` would otherwise fail to parse and be treated as unreachable
 * rather than as the same-host redirect it is.
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param allowPrivate - Allow private IPs (default: false) - use ONLY for testing
 */
/**
 * Headers that authenticate the request, and so must not survive a hop to an
 * origin the caller never addressed.
 *
 * The named three are what browsers drop on a cross-origin redirect. The
 * pattern covers what this application sends beyond them — X-Collector-Key to
 * a cluster collector, X-Api-Key to a server — because the destination of a
 * redirect is chosen by the very host the credential authenticates against.
 */
const CREDENTIAL_HEADER = /^(authorization|cookie|proxy-authorization)$/i;
const CREDENTIAL_HEADER_PATTERN = /(^|-)(key|token|secret|password|auth|credential)(-|$)/i;

function isCredentialHeader(name: string): boolean {
  return CREDENTIAL_HEADER.test(name) || CREDENTIAL_HEADER_PATTERN.test(name);
}

/** The same request with every credential header removed. */
function withoutCredentials(init: RequestInit | undefined): RequestInit | undefined {
  if (!init?.headers) return init;

  const kept = new Headers();
  new Headers(init.headers).forEach((value, name) => {
    if (!isCredentialHeader(name)) kept.set(name, value);
  });

  return { ...init, headers: kept };
}

/** Whether two URLs differ in scheme, host or port. */
function crossOrigin(from: string, to: string): boolean {
  return new URL(from).origin !== new URL(to).origin;
}

/**
 * Refuse a hostname whose addresses are not all globally routable.
 *
 * validateUrlForSSRF can only judge the text of a URL. A name is not an
 * address: `internal.attacker.example` looks entirely ordinary and its A record
 * can be 127.0.0.1, which is how a guard that reads hostnames gets walked past.
 *
 * Every address is checked and any private one rejects the request, rather than
 * picking a public one out of the set. Without pinning there is nothing to
 * guarantee the socket lands on the address that was approved.
 *
 * What this does not do: `fetch` resolves the name again when it opens the
 * connection, so a host that answers differently the second time can still move
 * the request after the check. Closing that needs the address handed to the
 * socket — which is what lib/mcp/pinned-head-request.ts does over node:http,
 * and what global fetch gives no way to do. This narrows the hole to an
 * attacker who can time a DNS answer, from one who only has to own a name.
 */
async function resolveToPinnableAddress(
  url: URL
): Promise<{ address: string; family: number }> {
  // An IP literal has no name to resolve; validateUrlForSSRF already judged it,
  // and it is its own pin.
  const literal = ipLiteralFromHost(url.hostname);
  if (literal !== null) {
    return { address: literal, family: literal.includes(':') ? 6 : 4 };
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dns.lookup(url.hostname, { all: true });
  } catch {
    throw new Error(`Host ${url.hostname} could not be resolved`);
  }

  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error(
      `Host ${url.hostname} resolves to a private or reserved address, which is not allowed`
    );
  }

  // The first address is returned *and used*. Approving the set and then
  // letting the socket resolve again was the rebinding window: the check and
  // the connection could disagree. pinnedFetch connects to this address, so
  // there is nothing left to disagree with.
  return addresses[0];
}

export async function safeFetch(
  url: string,
  options?: RequestInit,
  allowPrivate = false
): Promise<Response> {
  // Reassigned when a 301/302/303 downgrades the method, and when a
  // cross-origin hop drops credentials — see below.
  let requestInit = options;
  let currentUrl = url;

  // 307 and 308 replay the body, so it has to survive being sent twice.
  // URLSearchParams — what the OAuth callers send — is consumed by the first
  // request, and the replay would go out empty. Serializing it up front costs
  // nothing and makes the body replayable.
  if (requestInit?.body instanceof URLSearchParams) {
    const headers = new Headers(requestInit.headers);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
    }
    requestInit = { ...requestInit, body: requestInit.body.toString(), headers };
  }

  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    // Fetch the URL the validator returned rather than the string that went
    // into it. The two are equivalent, but using the validated value makes the
    // sanitiser-to-sink path explicit — to a reader and to static analysis,
    // which otherwise cannot tell that a validator throwing on the line above
    // guards this call.
    const validated = validateUrlForSSRF(currentUrl, allowPrivate);

    // Per hop, not once: a redirect chooses its own destination, and the second
    // host is no more trustworthy than the first.
    //
    // allowPrivate is the test path, which deliberately targets loopback. It
    // gets plain fetch, because there is nothing to pin to when the point is to
    // reach a private address.
    const response = allowPrivate
      ? await fetch(validated, { ...requestInit, redirect: 'manual' })
      : await pinnedFetch(
          validated,
          requestInit,
          ...(({ address, family }) => [address, family] as const)(
            await resolveToPinnableAddress(validated)
          )
        );

    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get('location');
    // A redirect status with no Location is the server's problem, not a hop —
    // hand it back rather than inventing a destination.
    if (!location) return response;

    // RFC 9110: 301, 302 and 303 turn the follow-up request into a GET and drop
    // the body; only 307 and 308 preserve the method. Replaying a POST body to
    // a redirect target is both a spec violation and a way to deliver a payload
    // somewhere the caller never addressed.
    if (response.status === 301 || response.status === 302 || response.status === 303) {
      requestInit = { ...requestInit, method: 'GET', body: undefined };
    }

    // Release the redirect's body before moving on. With redirect: 'manual'
    // every hop hands back a response nobody reads, and undici holds the
    // stream — and its connection — until GC gets to it. The callers here
    // resolve attacker-supplied URLs, so a hostile host can answer with
    // large-bodied redirects and lean on that: twenty hops per request, each
    // leaving a stream open. cancel() discards it without downloading, which
    // is the point; response.text() would fetch the very bytes being refused.
    //
    // On the pinned path this is already handled a layer down — pinnedFetch
    // destroys a 3xx stream rather than buffering it, so the body here is
    // null and `?.` short-circuits. It still matters for the allowPrivate
    // path, which goes through fetch.
    await response.body?.cancel().catch(() => {
      // An already-disturbed or closed body is nothing to act on, and failing
      // to release it must not fail the request that was otherwise fine.
    });

    const nextUrl = new URL(location, currentUrl).toString();

    // Browsers drop Authorization on a cross-origin redirect, and for the same
    // reason: the host answering this hop was chosen by the previous one, not
    // by the caller, so it has no claim on credentials meant for the caller's
    // destination.
    if (crossOrigin(currentUrl, nextUrl)) {
      requestInit = withoutCredentials(requestInit);
    }

    currentUrl = nextUrl;
  }

  throw new Error('Too many redirects');
}
