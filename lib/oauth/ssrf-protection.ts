/**
 * SSRF (Server-Side Request Forgery) Protection
 * Validates URLs to prevent access to private networks and reserved IP ranges
 */

/**
 * Check if a hostname is a private or reserved IP address
 * Prevents SSRF attacks against internal services
 */
function isPrivateOrReservedIP(hostname: string): boolean {
  // Check for localhost variations
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.startsWith('127.') ||
    hostname === '0.0.0.0'
  ) {
    return true;
  }

  // Check for private IPv4 ranges
  const privateIPv4Ranges = [
    /^10\./, // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./, // 192.168.0.0/16
    /^169\.254\./, // Link-local (AWS/GCP metadata)
  ];

  if (privateIPv4Ranges.some((range) => range.test(hostname))) {
    return true;
  }

  // Check for private IPv6 ranges
  const privateIPv6Patterns = [
    /^fe80:/i, // Link-local
    /^fc00:/i, // Unique local addresses
    /^fd00:/i, // Unique local addresses
    /^::1$/i, // Loopback
    /^::ffff:127\./i, // IPv4-mapped loopback
  ];

  if (privateIPv6Patterns.some((pattern) => pattern.test(hostname))) {
    return true;
  }

  return false;
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

    const response = await fetch(validated, { ...requestInit, redirect: 'manual' });

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
