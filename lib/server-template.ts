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

  // https://api.example.com?api_key=abcd1234
  text = text.replace(
    /([?&](?:api_key|access_token|token|key|auth|apikey)=)([^&\s]+)/gi,
    `$1${REDACTED_API_KEY}`
  );

  // https://user:password@example.com
  text = text.replace(/(https?:\/\/[^:]+):([^@]+)@/gi, `$1:${REDACTED_PASSWORD}@`);

  // A credential passed inline as a command-line flag: keep the flag itself,
  // replace whatever value follows it.
  text = text.replace(
    /(--[\w-]*(?:token|key|secret|password|auth)[\w-]*[=\s])(\S+)/gi,
    `$1${REDACTED_VALUE}`
  );

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
    sanitized.args = sanitized.args.map((arg: unknown) =>
      typeof arg === 'string' ? sanitizeConnectionString(arg) : arg
    );
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
