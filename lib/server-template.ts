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
 *
 * They fail closed. A template is rebuilt from an allowlist of fields rather
 * than copied and pruned: pruning is how `streamableHTTPOptions.requestInit`
 * - where the OAuth refresh writes the live access token - rode along on the
 * rest spread. A field this file does not know is dropped, not published.
 */

const REDACTED_VALUE = '<YOUR_SECRET_HERE>';
const REDACTED_PASSWORD = '<YOUR_PASSWORD>';
const REDACTED_API_KEY = '<YOUR_API_KEY>';

/**
 * What a parameter, flag, variable or JSON key has to be called for its value
 * to count as a credential. One definition drives every rule below, so they
 * cannot drift apart.
 *
 * The strong terms match as substrings, which catches `client_secret`,
 * `refresh_token` and `x-auth-token`. A bare `key` has to be the whole name -
 * matching it as a substring would redact `monkey` and `keyspace` - but a
 * `key` or `pat` after a separator (`STRIPE_KEY`, `GITHUB_PAT`) is one.
 *
 * Every repetition in these patterns is bounded. They run over text anyone can
 * publish, on anonymous read paths, and an unbounded `[\w-]*` backtracks
 * quadratically over a long run of word characters.
 */
const CREDENTIAL_NAME = String.raw`(?:key|[\w-]{0,64}(?:token|secret|password|passwd|pwd|auth|credential|cookie|session[-_]?id|api[-_]?key|access[-_]?key)[\w-]{0,64}|[\w-]{0,64}[-_](?:key|pat))`;

/** `?client_secret=live-value` */
const CREDENTIAL_QUERY_PARAM = new RegExp(String.raw`([?&]${CREDENTIAL_NAME}=)([^&\s]+)`, 'gi');
/** `--client-secret=live-value` or `--client-secret live-value` */
const CREDENTIAL_FLAG_INLINE = new RegExp(String.raw`(--${CREDENTIAL_NAME}[=\s])(\S+)`, 'gi');
/** `--client-secret`, with the value in the next argv entry */
const CREDENTIAL_FLAG_EXACT = new RegExp(String.raw`^--${CREDENTIAL_NAME}$`, 'i');
/** `GITHUB_TOKEN=live-value`, as a bare argument or inside a command line */
const CREDENTIAL_ASSIGNMENT = new RegExp(String.raw`(^|[\s;&|'"])(${CREDENTIAL_NAME}=)([^\s;&|'"]+)`, 'gi');
/** `"apiKey": "live-value"`, in a JSON-valued argument */
const CREDENTIAL_JSON_MEMBER = new RegExp(String.raw`("${CREDENTIAL_NAME}"\s*:\s*")([^"]*)(")`, 'gi');
/** A whole object key that names a credential. */
const CREDENTIAL_KEY = new RegExp(String.raw`^${CREDENTIAL_NAME}$`, 'i');

/**
 * `Bearer <token>` / `Basic <token>`. The token has to look like one - a digit
 * somewhere, or long - so prose such as "bearer authentication" survives.
 */
const AUTH_SCHEME_TOKEN = /\b(Bearer|Basic)(\s+)((?=[\w.~+/=-]*\d)[\w.~+/=-]{8,}|[\w.~+/=-]{20,})/gi;

/** `user:password@tcp(host:3306)/db` - the Go MySQL DSN, which has no `scheme://`. */
const GO_DSN = /(^|[\s='"])([^\s:/@'"=]{1,128}):(\S{1,256})@((?:tcp|udp|unix)\()/gi;

/**
 * `scheme://` and the rest of the whitespace-delimited token after it, up to
 * where another `scheme://` begins - so each URL in `a://x,b://u:p@y` is
 * inspected on its own.
 */
const SCHEME_URL = /[a-z][a-z0-9+.-]{0,31}:\/\/(?:(?![a-z][a-z0-9+.-]{0,31}:\/\/)\S)*/gi;

/**
 * Mask the userinfo of one `scheme://...` token, whatever the scheme.
 *
 * Scheme-specific patterns are how `postgres://`, `mongodb+srv://` and
 * `redis://` passwords survived: each alias had to be listed, and none were.
 * The authority is found the way RFC 3986 defines it instead - up to the first
 * `/`, `?` or `#`, with userinfo being everything before its last `@`.
 */
function redactUrlUserinfo(url: string): string {
  const prefixLength = url.indexOf('://') + 3;
  const rest = url.slice(prefixLength);
  const authorityEnd = rest.search(/[/?#]/);
  const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);

  let at = authority.lastIndexOf('@');
  if (at === -1) {
    // A password holding an unencoded `/`, `?` or `#` ends the authority
    // early: `user:pa/ss@host`. What follows the colon is then not a port,
    // which is all digits, so the credential runs to the last `@`.
    const colon = authority.indexOf(':');
    if (authority.startsWith('[') || colon === -1 || /^\d*$/.test(authority.slice(colon + 1))) {
      return url;
    }
    at = rest.lastIndexOf('@');
    if (at === -1) return url;
  }

  const userinfo = rest.slice(0, at);
  const colon = userinfo.indexOf(':');
  // With a colon, the part before it is the user name - keep it so the
  // importer knows whose password to supply. Without one the whole userinfo
  // is usually a token (`https://ghp_...@github.com`).
  const redacted = colon === -1 ? REDACTED_VALUE : `${userinfo.slice(0, colon)}:${REDACTED_PASSWORD}`;
  return url.slice(0, prefixLength) + redacted + rest.slice(at);
}

/**
 * The URL rules alone: userinfo of any scheme and credential query
 * parameters. Safe on prose, so it is what descriptive fields get.
 */
function redactUrlCredentials(text: string): string {
  return text
    .replace(SCHEME_URL, redactUrlUserinfo)
    .replace(CREDENTIAL_QUERY_PARAM, `$1${REDACTED_API_KEY}`);
}

/**
 * Mask credentials embedded in a connection string or argument: URL userinfo
 * of any scheme, DSNs, api keys carried as query parameters, bearer tokens,
 * credential flags, `NAME=value` assignments and JSON members.
 */
export function sanitizeConnectionString(text: string): string {
  if (!text) return text;

  text = redactUrlCredentials(text);
  text = text.replace(GO_DSN, `$1$2:${REDACTED_PASSWORD}@$4`);
  text = text.replace(AUTH_SCHEME_TOKEN, `$1$2${REDACTED_VALUE}`);

  // A credential passed as a command-line flag: keep the flag, replace the value
  text = text.replace(CREDENTIAL_FLAG_INLINE, `$1${REDACTED_VALUE}`);
  text = text.replace(CREDENTIAL_ASSIGNMENT, `$1$2${REDACTED_VALUE}`);
  text = text.replace(CREDENTIAL_JSON_MEMBER, `$1${REDACTED_VALUE}$3`);

  return text;
}

/**
 * The names out of an env or header collection, each mapped to the
 * placeholder. Accepts an object, a list of `NAME=value` / `Name: value`
 * strings, or a list of `[name, value]` pairs; the values never survive, so
 * the shape they arrived in does not matter.
 */
function redactNamedValues(collection: unknown): Record<string, string> | undefined {
  let names: unknown[];
  if (Array.isArray(collection)) {
    names = collection.map((entry) => {
      if (typeof entry === 'string') return entry.split(/[=:]/, 1)[0].trim();
      if (Array.isArray(entry)) return entry[0];
      if (entry && typeof entry === 'object') {
        const named = entry as { name?: unknown; key?: unknown };
        return named.name ?? named.key;
      }
      return undefined;
    });
  } else if (collection && typeof collection === 'object') {
    names = Object.keys(collection);
  } else {
    return undefined;
  }

  return Object.fromEntries(
    names
      .filter((name): name is string => typeof name === 'string' && name.length > 0)
      .map((name) => [name, REDACTED_VALUE])
  );
}

/** `NAME=value` -> `NAME=<placeholder>`; a bare `NAME` is left alone. */
function redactAssignment(pair: string): string {
  const eq = pair.indexOf('=');
  return eq === -1 ? pair : `${pair.slice(0, eq)}=${REDACTED_VALUE}`;
}

/** `Name: value` -> `Name: <placeholder>`; anything else is not a header, so it goes. */
function redactHeaderLine(line: string): string {
  const match = /^(\s*[^\s:=]+\s*[:=]\s*)(.*)$/.exec(line);
  if (!match) return REDACTED_VALUE;
  return match[2] ? `${match[1]}${REDACTED_VALUE}` : line;
}

const ENV_FLAG = /^(?:-e|--env)$/;
const ENV_FLAG_INLINE = /^(--env=)(.*)$/;
const HEADER_FLAG = /^(?:-H|--header)$/;
const HEADER_FLAG_INLINE = /^(--header=)(.*)$/;

/**
 * Sanitize an argv list. Each entry is scrubbed on its own, then the pairs a
 * per-string pass cannot see are handled: `--client-secret value`,
 * `-e NAME=value` (docker, and anything else that forwards environment) and
 * `--header "Authorization: ..."`. Header values are credentials by nature,
 * so the value goes whatever the header is called.
 */
function sanitizeArgs(args: unknown[]): unknown[] {
  const out = args.map((arg) => {
    if (typeof arg === 'string') return sanitizeConnectionString(arg);
    if (typeof arg === 'number' || typeof arg === 'boolean') return arg;
    // An object in argv is not something an importer can run; do not publish it.
    return REDACTED_VALUE;
  });

  for (let i = 0; i < out.length; i++) {
    const arg = out[i];
    if (typeof arg !== 'string') continue;
    const next = out[i + 1];

    if (CREDENTIAL_FLAG_EXACT.test(arg) && i + 1 < out.length) {
      out[i + 1] = REDACTED_VALUE;
    } else if (ENV_FLAG.test(arg) && typeof next === 'string') {
      out[i + 1] = redactAssignment(next);
    } else if (HEADER_FLAG.test(arg) && typeof next === 'string') {
      out[i + 1] = redactHeaderLine(next);
    } else if (ENV_FLAG_INLINE.test(arg)) {
      out[i] = arg.replace(ENV_FLAG_INLINE, (_m, flag: string, pair: string) => flag + redactAssignment(pair));
    } else if (HEADER_FLAG_INLINE.test(arg)) {
      out[i] = arg.replace(HEADER_FLAG_INLINE, (_m, flag: string, line: string) => flag + redactHeaderLine(line));
    }
  }

  return out;
}

const MAX_DEPTH = 8;

/**
 * Recursive scrub for free-form values (custom instructions, collection
 * metadata): every string goes through the connection-string rules, a key
 * that names a credential loses its value, and `env` / `headers` keep only
 * their names. Too deep to reason about is redacted rather than passed on.
 */
function scrubDeep(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return sanitizeConnectionString(value);
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return undefined;
  if (depth >= MAX_DEPTH) return REDACTED_VALUE;

  if (Array.isArray(value)) {
    return value.map((item) => scrubDeep(item, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (/^(?:env|headers)$/i.test(key)) return [key, redactNamedValues(item) ?? REDACTED_VALUE];
      if (CREDENTIAL_KEY.test(key)) return [key, REDACTED_VALUE];
      return [key, scrubDeep(item, depth + 1)];
    })
  );
}

/**
 * Fields a listing or an importer reads that are description, not connection.
 * Scalars only: an object turning up in one of these is not what the field
 * means, and is dropped.
 */
const DESCRIPTIVE_FIELDS = [
  'uuid',
  'name',
  'title',
  'description',
  'type',
  'source',
  'status',
  'transport',
  'category',
  'version',
  'created_at',
  'updated_at',
  'originalServerUuid',
  'sharedBy',
  'external_id',
  'requires_credentials',
  'repository_url',
  'github_owner',
  'github_repo',
  'averageRating',
  'ratingCount',
  'installationCount',
] as const;

/** Lists of plain strings. */
const STRING_LIST_FIELDS = ['tags', 'credential_fields'] as const;

function isDescriptiveScalar(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  );
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

  const source = template as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const field of DESCRIPTIVE_FIELDS) {
    const value = source[field];
    if (!(field in source) || !isDescriptiveScalar(value)) continue;
    sanitized[field] = typeof value === 'string' ? redactUrlCredentials(value) : value;
  }

  for (const field of STRING_LIST_FIELDS) {
    const value = source[field];
    if (Array.isArray(value)) {
      sanitized[field] = value.filter((item): item is string => typeof item === 'string');
    }
  }

  if (typeof source.command === 'string') {
    sanitized.command = sanitizeConnectionString(source.command);
  }

  if (Array.isArray(source.args)) {
    sanitized.args = sanitizeArgs(source.args);
  }

  if (typeof source.url === 'string') {
    sanitized.url = sanitizeConnectionString(source.url);
  }

  // Every env value is redacted, not just the ones whose key reads as secret:
  // a name like GITHUB_PAT or NOTION_DB carries a credential just as often, and
  // guessing from the key is how the previous heuristic let them through. The
  // keys stay so the importer still knows what to supply.
  const env = redactNamedValues(source.env);
  if (env) sanitized.env = env;

  // Headers are pure credentials; only their names are structure.
  const headers = redactNamedValues(source.headers);
  if (headers) sanitized.headers = headers;

  // Transport options are rebuilt, not pruned. Only `headers` is install
  // structure; `requestInit` (where the OAuth refresh writes the live bearer
  // token), `oauth`, `authProvider` and `sessionId` are the owner's session.
  const options = source.streamableHTTPOptions;
  if (options && typeof options === 'object' && !Array.isArray(options)) {
    const optionHeaders = redactNamedValues((options as { headers?: unknown }).headers);
    sanitized.streamableHTTPOptions = optionHeaders ? { headers: optionHeaders } : {};
  }

  if (source.customInstructions !== undefined) {
    sanitized.customInstructions = scrubDeep(source.customInstructions);
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
 * `content` has no enforced schema, and dropping unrecognised shapes would
 * silently destroy collections rather than protect them. So each server in
 * the list is rebuilt from the template allowlist, and everything else is
 * kept but scrubbed recursively.
 */
export function sanitizeCollectionContent<T>(content: T): T {
  if (!content || typeof content !== 'object') {
    return scrubDeep(content) as T;
  }

  const servers = (content as { servers?: unknown }).servers;
  if (!Array.isArray(servers)) {
    return scrubDeep(content) as T;
  }

  const { servers: _servers, ...rest } = content as Record<string, unknown>;
  return {
    ...(scrubDeep(rest) as object),
    servers: servers.map((server) => sanitizeServerTemplate(server)),
  } as T;
}
