import http from 'node:http';
import https from 'node:https';
import { pipeline, Readable, Transform } from 'node:stream';

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
 * Responses are buffered by default. MCP transports opt into a bounded stream
 * so SSE headers and events arrive before the connection ends. A stream is
 * bounded differently from a buffered body; see `limits` on pinnedFetch.
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

/**
 * How long a streamed request may wait, silent, for its response headers —
 * undici's headersTimeout, which is what MCP transports ran with before they
 * were pinned. A tool call can take minutes before the server answers at all.
 */
export const DEFAULT_STREAM_HEADERS_TIMEOUT_MS = 300_000;

export interface PinnedFetchLimits {
  /**
   * Buffered: the whole body. Stream: the most a reader has to hold at once —
   * one event of a `text/event-stream` body, or the whole body of any other
   * type, which a reader consumes as a single message (JSON, say).
   */
  maxBytes?: number;
  /**
   * Buffered: socket inactivity at any point of the request (default 30 s).
   * Stream: inactivity until the response headers arrive (default 300 s).
   * After that a stream has no timer of its own: a quiet SSE stream is
   * working as intended, and its life is the caller's AbortSignal.
   */
  timeoutMs?: number;
  /** Hand the body back as it arrives instead of buffering it to the end. */
  stream?: boolean;
}

/**
 * A byte counter for an SSE body that resets at every event boundary (a blank
 * line; lines end in CRLF, LF or CR, and chunks can split any of them).
 * Returns false once the event in progress exceeds `maxBytes`.
 *
 * An event is what a reader buffers before it can act — the SDK's parser holds
 * one until its blank line — so that is what is capped. Counting every byte a
 * stream ever carried ended long sessions for no reason.
 */
function perEventByteLimit(maxBytes: number): (chunk: Buffer) => boolean {
  let pending = 0;
  let atLineStart = true;
  let afterCR = false;
  return (chunk) => {
    for (let i = 0; i < chunk.length; i++) {
      const byte = chunk[i];
      if (byte === 0x0a && afterCR) {
        afterCR = false; // the LF of a CRLF; the CR already ended the line
        continue;
      }
      afterCR = byte === 0x0d;
      if (byte === 0x0a || byte === 0x0d) {
        if (atLineStart) pending = 0; // a blank line ends the event
        atLineStart = true;
        continue;
      }
      atLineStart = false;
      if (++pending > maxBytes) return false;
    }
    return true;
  };
}

/** A counter over the whole body. */
function totalByteLimit(maxBytes: number): (chunk: Buffer) => boolean {
  let received = 0;
  return (chunk) => (received += chunk.length) <= maxBytes;
}

export async function pinnedFetch(
  url: URL,
  init: RequestInit | undefined,
  address: string,
  family: number,
  limits: PinnedFetchLimits = {}
): Promise<Response> {
  const maxBytes = limits.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs =
    limits.timeoutMs ?? (limits.stream ? DEFAULT_STREAM_HEADERS_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
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
    let incoming: http.IncomingMessage | undefined;
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
        incoming = response;
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

        if (limits.stream) {
          // The headers are in, so the wait `timeoutMs` bounds is over. From
          // here a silence is a stream doing its job — an SSE connection idles
          // until the server has something to say — and the socket's idle
          // timer would destroy it mid-body. The body now lasts as long as the
          // caller's AbortSignal (and the SDK's request timeouts) allow.
          // The request's `timeout` is this socket's idle timer; 0 disarms it.
          response.socket?.setTimeout(0);

          const isEventStream = (responseHeaders.get('content-type') ?? '')
            .toLowerCase()
            .startsWith('text/event-stream');
          const withinLimit = isEventStream ? perEventByteLimit(maxBytes) : totalByteLimit(maxBytes);
          const bounded = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              callback(withinLimit(chunk)
                ? null
                : new Error(`Response body too large (over ${maxBytes} bytes)`), chunk);
            },
          });
          // pipeline propagates upstream failures and tears down the socket
          // when a reader cancels. toWeb maintains backpressure.
          pipeline(response, bounded, () => {});
          const body = Readable.toWeb(bounded, {
            strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength },
          }) as ReadableStream<Uint8Array>;
          resolve(new Response(body, {
            status, statusText: response.statusMessage ?? '', headers: responseHeaders,
          }));
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
      const error = signal?.reason instanceof Error ? signal.reason : new Error('The operation was aborted');
      incoming?.destroy(error);
      request.destroy(error);
      reject(error);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    request.on('close', () => signal?.removeEventListener('abort', onAbort));

    request.on('timeout', () => {
      const error = new Error(`Request to ${url.hostname} timed out after ${timeoutMs}ms`);
      incoming?.destroy(error);
      request.destroy(error);
      reject(error);
    });
    request.on('error', (error) => { incoming?.destroy(error); reject(error); });
    if (typeof body === 'string') request.write(body);
    request.end();
  });
}
