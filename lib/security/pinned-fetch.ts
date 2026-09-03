import http from 'node:http';
import https from 'node:https';

/**
 * A `lookup` that answers with a fixed address instead of consulting DNS.
 *
 * Two callback shapes have to be handled. net.connect asks with `all: true`
 * when it is choosing between address families (autoSelectFamily) and then
 * expects an array; answering with the scalar form there fails outright with
 * ERR_INVALID_IP_ADDRESS rather than falling back. Getting this wrong is silent
 * at compile time and total at run time — every request errors.
 */
export function pinnedLookup(address: string, family: number) {
  return (
    _hostname: string,
    options: { all?: boolean } | undefined,
    callback: (
      error: NodeJS.ErrnoException | null,
      addressOrList: string | Array<{ address: string; family: number }>,
      family?: number
    ) => void
  ) => {
    if (options?.all) {
      callback(null, [{ address, family }]);
      return;
    }
    callback(null, address, family);
  };
}

/**
 * One HTTP request to an address that has already been checked.
 *
 * Resolving a hostname, approving what came back, and then handing the *name*
 * to `fetch` leaves a window: the name is looked up a second time when the
 * socket opens, and a host the caller controls can answer differently that
 * time. The check and the connection then disagree.
 *
 * `node:http` and `node:https` accept a `lookup` of their own, so the socket is
 * given the address that was actually validated while the Host header and the
 * TLS server name stay the hostname — vhosts and certificate validation keep
 * working. Global `fetch` offers no equivalent, which is why this exists rather
 * than passing a dispatcher.
 *
 * Redirects are not followed. The caller decides whether to take a hop, because
 * taking one means validating and resolving a new host.
 *
 * The body is buffered rather than streamed. Every caller in this codebase
 * reads the whole response — `.json()` or `.text()`, including the two that
 * parse `text/event-stream` — so there is nothing to gain from a stream and a
 * `Response` built from a buffer keeps the interface identical to `fetch`.
 *
 * Buffering has to be bounded, though, and node:http brings none of undici's
 * defaults:
 *
 * - A redirect's body is discarded without reading it. safeFetch follows up to
 *   twenty hops against attacker-supplied hosts, and cancelled each hop's body
 *   for exactly this reason; buffering to `end` first would have undone that.
 * - A size cap, so a host cannot answer a single request with more than the
 *   process can hold.
 * - An inactivity timeout, so a host that accepts the connection and then says
 *   nothing does not hold the request open forever.
 */
/**
 * Final statuses that must not carry a body. `new Response(buffer, {status})`
 * throws for these rather than ignoring the body.
 *
 * The Fetch standard also lists 101 and 103, but a client never yields those as
 * a response: node:http reports 1xx through the `information` event, and
 * `new Response` rejects any status below 200 outright. They are handled as an
 * error below rather than listed here, so an unexpected one surfaces as a
 * rejection instead of an unhandled RangeError.
 */
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Large enough for any response this application reads, small enough to hold. */
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

/** Inactivity, not total duration — a slow but progressing response is fine. */
const DEFAULT_TIMEOUT_MS = 30_000;

export async function pinnedFetch(
  url: URL,
  init: RequestInit | undefined,
  address: string,
  family: number,
  limits: { maxBytes?: number; timeoutMs?: number } = {}
): Promise<Response> {
  const maxBytes = limits.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = limits.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const transport = url.protocol === 'https:' ? https : http;

  const headers = new Headers(init?.headers);
  const body = init?.body;

  if (body !== undefined && body !== null && typeof body !== 'string') {
    // safeFetch serialises URLSearchParams before it gets here; anything else
    // would be silently dropped, which is worse than refusing.
    throw new TypeError('pinnedFetch requires a string body');
  }

  const signal = init?.signal ?? undefined;
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error('The operation was aborted');
  }

  return new Promise<Response>((resolve, reject) => {
    const request = transport.request(
      {
        method: init?.method ?? 'GET',
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ''), // node wants the bare v6 address
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        timeout: timeoutMs,
        headers: Object.fromEntries(headers.entries()),
        // Hand the socket the address that was checked, rather than resolving
        // the name again. This is the entire point of the module.
        lookup: pinnedLookup(address, family),
      },
      (response) => {
        const status = response.statusCode ?? 502;

        if (status < 200 || status > 599) {
          response.destroy();
          request.destroy();
          reject(new Error(`Unrepresentable HTTP status ${status}`));
          return;
        }

        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) responseHeaders.append(name, item);
          } else if (value !== undefined) {
            responseHeaders.set(name, value);
          }
        }

        // Uint8Array<ArrayBuffer>, not Buffer and not a view over one. Buffer
        // is absent from the DOM lib's BodyInit union, and a view carries
        // `ArrayBufferLike`, which BodyInit also rejects — both compile-time
        // only, both fine at run time. The copy is bounded by maxBytes.
        const finish = (body: Uint8Array<ArrayBuffer> | null) =>
          resolve(
            new Response(body, {
              status,
              statusText: response.statusMessage ?? '',
              headers: responseHeaders,
            })
          );

        // Three cases with no body to read.
        //
        // A redirect's headers are the whole answer; the body is never read by
        // anyone and is the cheapest thing for a hostile host to make large.
        // Destroying the stream stops the download rather than discarding it
        // afterwards.
        //
        // A HEAD has no body by definition, and fetch gives those a null body.
        // Buffering would produce an empty one instead — an empty stream is
        // not null, and callers can tell the difference.
        //
        // And the statuses the Fetch standard forbids a body on.
        const isHead = (init?.method ?? 'GET').toUpperCase() === 'HEAD';
        if (isHead || REDIRECT_STATUSES.has(status) || NULL_BODY_STATUSES.has(status)) {
          response.destroy();
          finish(null);
          return;
        }

        const chunks: Buffer[] = [];
        let received = 0;

        response.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > maxBytes) {
            response.destroy();
            request.destroy();
            reject(new Error(`Response body too large (over ${maxBytes} bytes)`));
            return;
          }
          chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          finish(new Uint8Array(Buffer.concat(chunks)));
        });
      }
    );

    const onAbort = () => {
      request.destroy();
      reject(signal?.reason instanceof Error ? signal.reason : new Error('The operation was aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    request.on('close', () => signal?.removeEventListener('abort', onAbort));

    request.on('timeout', () => {
      request.destroy();
      reject(new Error(`Request to ${url.hostname} timed out after ${timeoutMs}ms`));
    });
    request.on('error', reject);
    if (typeof body === 'string') request.write(body);
    request.end();
  });
}
