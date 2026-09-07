import { safeFetch } from '@/lib/oauth/ssrf-protection';

/** Every remote MCP hop uses the address checked by the SSRF validator. */
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
