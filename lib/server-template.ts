/**
 * Sanitizers for the `template` blob persisted on a shared MCP server.
 *
 * A share's template is world-readable once `is_public` is set, and it is the
 * install recipe an importer follows. It therefore has to keep the *structure*
 * of the connection (command, args, env keys) while carrying none of the
 * owner's credentials. These helpers are the single place that decides where
 * that line sits, and they run on both the write path (so nothing unsanitized
 * is stored, including a caller-supplied `customTemplate`) and the read paths
 * (so shares stored before this existed are covered without a backfill).
 */

const REDACTED_VALUE = '<YOUR_SECRET_HERE>';
const REDACTED_PASSWORD = '<YOUR_PASSWORD>';
const REDACTED_API_KEY = '<YOUR_API_KEY>';

/**
 * What a parameter or flag has to be called for its value to count as a
 * credential. One definition drives both the query-string rule and the
 * command-line rule, so the two cannot drift apart.
 *
 * The strong terms match as substrings, which catches `client_secret`,
 * `refresh_token` and `x-auth-token`. A bare `key` has to be the whole name -
 * matching it as a substring would redact `monkey` and `keyspace`.
 */
const CREDENTIAL_NAME = String.raw`(?:key|[\w-]*(?:token|secret|password|passwd|auth|credential|api[-_]?key|access[-_]?key)[\w-]*)`;

/** `?client_secret=live-value` */
const CREDENTIAL_QUERY_PARAM = new RegExp(String.raw`([?&]${CREDENTIAL_NAME}=)([^&\s]+)`, 'gi');
/** `--client-secret=live-value` or `--client-secret live-value` */
const CREDENTIAL_FLAG_INLINE = new RegExp(String.raw`(--${CREDENTIAL_NAME}[=\s])(\S+)`, 'gi');
/** `--client-secret`, with the value in the next argv entry */
const CREDENTIAL_FLAG_EXACT = new RegExp(String.raw`^--${CREDENTIAL_NAME}$`, 'i');

/**
 * Mask credentials embedded in a connection string: database URLs with inline
 * passwords, HTTP basic auth, and api keys carried as query parameters.
 */
export function sanitizeConnectionString(text: string): string {
  if (!text) return text;

  // postgresql://user:password@host/db, and the mongodb/mysql equivalents
  text = text.replace(
    /((?:postgresql|mongodb|mysql):\/\/[^:]+):([^@]+)@([^/]+\/[^\s]+)/gi,
    `$1:${REDACTED_PASSWORD}@$3`
  );

  // A credential carried as a query parameter
  text = text.replace(CREDENTIAL_QUERY_PARAM, `$1${REDACTED_API_KEY}`);

  // https://user:password@example.com
  text = text.replace(/(https?:\/\/[^:]+):([^@]+)@/gi, `$1:${REDACTED_PASSWORD}@`);

  // A credential passed as a command-line flag: keep the flag, replace the value
  text = text.replace(CREDENTIAL_FLAG_INLINE, `$1${REDACTED_VALUE}`);

  return text;
}

/**
 * Strip credentials from a shared-server template, preserving everything an
 * importer needs to recreate the server. Pure: the input is never mutated, and
 * running it twice gives the same result as running it once.
 */
export function sanitizeServerTemplate<T>(template: T): T {
  if (!template || typeof template !== 'object') {
    return template;
  }

  const sanitized: any = { ...(template as any) };

  if (typeof sanitized.command === 'string') {
    sanitized.command = sanitizeConnectionString(sanitized.command);
  }

  if (Array.isArray(sanitized.args)) {
    const args = sanitized.args.map((arg: unknown) =>
      typeof arg === 'string' ? sanitizeConnectionString(arg) : arg
    );

    // `--client-secret live-value` splits the flag and its value across two
    // entries, so the per-string pass above cannot see the pairing.
    for (let i = 0; i < args.length - 1; i++) {
      if (typeof args[i] === 'string' && CREDENTIAL_FLAG_EXACT.test(args[i])) {
        args[i + 1] = REDACTED_VALUE;
      }
    }

    sanitized.args = args;
  }

  if (typeof sanitized.url === 'string') {
    sanitized.url = sanitizeConnectionString(sanitized.url);
  }

  // Every env value is redacted, not just the ones whose key reads as secret:
  // a name like GITHUB_PAT or NOTION_DB carries a credential just as often, and
  // guessing from the key is how the previous heuristic let them through. The
  // keys stay so the importer still knows what to supply.
  if (sanitized.env && typeof sanitized.env === 'object' && !Array.isArray(sanitized.env)) {
    sanitized.env = Object.fromEntries(
      Object.keys(sanitized.env).map((key) => [key, REDACTED_VALUE])
    );
  }

  // Transport headers are pure credentials, and a session id is a live handle.
  if (sanitized.streamableHTTPOptions && typeof sanitized.streamableHTTPOptions === 'object') {
    const { sessionId: _sessionId, headers, ...rest } = sanitized.streamableHTTPOptions;
    sanitized.streamableHTTPOptions = { ...rest };
    if (headers && typeof headers === 'object') {
      sanitized.streamableHTTPOptions.headers = Object.fromEntries(
        Object.keys(headers).map((key) => [key, REDACTED_VALUE])
      );
    }
  }

  return sanitized as T;
}

/**
 * Strip credentials from a shared collection's `content`.
 *
 * `content` is client-supplied jsonb. The share dialog builds it as
 * `{ servers: [...templates] }` from templates that carry the owner's
 * decrypted command, args, env and url, and nothing sanitized it on the way
 * in. Like `sanitizeServerTemplate`, this runs on the write path so nothing
 * unsanitized is stored, and on the read paths so collections shared before
 * this existed are covered without a backfill.
 *
 * Anything that is not a list of servers is returned unchanged: `content` has
 * no enforced schema, and dropping unrecognised shapes would silently destroy
 * collections rather than protect them.
 */
export function sanitizeCollectionContent<T>(content: T): T {
  if (!content || typeof content !== 'object') {
    return content;
  }

  const servers = (content as { servers?: unknown }).servers;
  if (!Array.isArray(servers)) {
    return content;
  }

  return {
    ...(content as object),
    servers: servers.map((server) => sanitizeServerTemplate(server)),
  } as T;
}
