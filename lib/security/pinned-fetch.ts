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
 */
export async function pinnedFetch(
  url: URL,
  init: RequestInit | undefined,
  address: string,
  family: number
): Promise<Response> {
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
        headers: Object.fromEntries(headers.entries()),
        // Hand the socket the address that was checked, rather than resolving
        // the name again. This is the entire point of the module.
        lookup: pinnedLookup(address, family),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) {
              for (const item of value) responseHeaders.append(name, item);
            } else if (value !== undefined) {
              responseHeaders.set(name, value);
            }
          }

          const status = response.statusCode ?? 502;
          // 204 and 304 must not carry a body; `new Response(buffer, {status})`
          // throws for those rather than ignoring the body.
          const carriesBody = status !== 204 && status !== 304 && status >= 200;

          resolve(
            new Response(carriesBody ? Buffer.concat(chunks) : null, {
              status,
              statusText: response.statusMessage ?? '',
              headers: responseHeaders,
            })
          );
        });
      }
    );

    const onAbort = () => {
      request.destroy();
      reject(signal?.reason instanceof Error ? signal.reason : new Error('The operation was aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    request.on('close', () => signal?.removeEventListener('abort', onAbort));

    request.on('error', reject);
    if (typeof body === 'string') request.write(body);
    request.end();
  });
}
