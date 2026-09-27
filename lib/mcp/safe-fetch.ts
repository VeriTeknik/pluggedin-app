import { safeFetch } from '@/lib/oauth/ssrf-protection';

/**
 * Every remote MCP hop uses the address checked by the SSRF validator.
 *
 * Responses stream (safeFetch's last argument), under pinnedFetch's stream
 * limits rather than its buffered ones: up to 300 s for the response headers
 * (DEFAULT_STREAM_HEADERS_TIMEOUT_MS, undici's headersTimeout — a tool call can
 * take that long to answer), then no idle timer, because an SSE stream is
 * quiet between events and lives until the transport aborts it; and a size cap
 * per SSE event, or per body for anything else, instead of per stream.
 */
export const safeMcpFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : undefined;
  const url = request ? request.url : input.toString();
  const options: RequestInit = request ? {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
    ...(request.body && init?.body === undefined ? { body: await request.text() } : {}),
    ...init,
  } : { ...init };
  return safeFetch(url, options,
    process.env.NODE_ENV === 'development' || process.env.ALLOW_LOCAL_MCP_SERVERS === 'true',
    true);
};
