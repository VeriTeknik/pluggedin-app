/**
 * Redirect-URI matching.
 *
 * Exact match everywhere except loopback. Claude Code is a native client that
 * binds an ephemeral port and declares the port-less forms
 * (http://localhost/callback, http://127.0.0.1/callback) in its Client ID
 * Metadata Document, so both must match with the port ignored. RFC 8252 s7.3
 * requires this for the IP literal; Anthropic asks for the same treatment of
 * `localhost` even though s8.3 discourages the name.
 *
 * A CIMD cannot prevent loopback impersonation — any local process can bind a
 * port — which is why isLoopbackRedirect exists: the consent screen warns when
 * the only registered redirect URIs are loopback addresses.
 */

export const CLAUDE_HOSTED_REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function parse(uri: string): URL | undefined {
  try {
    return new URL(uri);
  } catch {
    return undefined;
  }
}

export function isLoopbackRedirect(uri: string): boolean {
  const url = parse(uri);
  if (!url) return false;
  return LOOPBACK_HOSTNAMES.has(url.hostname);
}

/**
 * Schemes that run code or read local content when navigated to. The consent
 * form assigns the redirect to window.location.href, so a `javascript:` URI
 * would execute in this origin — on Cancel as much as on Allow.
 */
const NON_REDIRECT_SCHEMES = new Set([
  'javascript:',
  'vbscript:',
  'data:',
  'blob:',
  'file:',
  'filesystem:',
  'about:',
  'view-source:',
]);

/**
 * Whether a URI may be a redirect target at all (RFC 9700 s2.1, RFC 8252).
 *
 * https anywhere; plain http only to loopback (RFC 8252 s7.3); otherwise a
 * native app's private-use scheme (s7.1) — which is why this is a list of
 * refused schemes rather than an allowlist: Cursor, VS Code and friends each
 * bring their own. No fragment (RFC 6749 s3.1.2) and no userinfo, which only
 * serves to make a URI look like it points somewhere it does not.
 */
export function isAllowedRedirectUri(uri: string): boolean {
  const url = parse(uri);
  if (!url || uri.includes('#')) return false;
  if (url.username || url.password) return false;

  if (url.protocol === 'https:') return url.hostname !== '';
  if (url.protocol === 'http:') return LOOPBACK_HOSTNAMES.has(url.hostname);
  return !NON_REDIRECT_SCHEMES.has(url.protocol);
}

export function redirectUriMatches(presented: string, registered: string): boolean {
  // Checked on both sides: a registration stored before registration-time
  // validation existed must not be able to vouch for itself.
  if (!isAllowedRedirectUri(presented) || !isAllowedRedirectUri(registered)) return false;

  const a = parse(presented);
  const b = parse(registered);
  if (!a || !b) return false;

  if (a.protocol !== b.protocol) return false;
  if (a.hostname !== b.hostname) return false;
  if (a.pathname !== b.pathname) return false;
  if (a.search !== b.search) return false;

  // Port is ignored only for loopback; everywhere else it is part of identity.
  if (LOOPBACK_HOSTNAMES.has(b.hostname)) return true;
  return a.port === b.port;
}
