const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Where mcp-remote style local OAuth listeners take the authorization response. */
const LISTENER_PATH = '/oauth/callback';

/**
 * A callback URL as a local OAuth listener, or null if it is anything else.
 *
 * The callback route (app/api/mcp/oauth/callback) forwards the provider's
 * response to the callback_url stored for a flow, from the production host. That
 * URL is copied out of an intercepted authorization request rather than
 * allocated by this app, so it is held to the shape such a listener actually
 * has: plain http, a loopback host, an explicit unprivileged port and the
 * callback path, and nothing else — the same rule the route enforces before it
 * forwards. Returned normalised, without query or fragment.
 */
export function oauthCallbackListener(candidate: string): URL | null {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname)) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== LISTENER_PATH) return null;

  const port = Number(url.port); // '' (implicit 80) reads as 0 and is refused
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return null;

  return new URL(`${url.origin}${LISTENER_PATH}`);
}
