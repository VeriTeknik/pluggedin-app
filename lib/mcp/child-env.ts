/**
 * The environment a spawned child may inherit from this process.
 *
 * This process holds the application's whole secret set — NEXTAUTH_SECRET,
 * DATABASE_URL, POSTGRES_PASSWORD, the Kubernetes service-account token, every
 * model-provider key — because docker-compose preloads /run/secrets/app.env via
 * `NODE_OPTIONS: -r dotenv/config`. They are in process.env for real.
 *
 * Anything spawned while adding or running an MCP server is a process the user
 * chose: the server itself, and the pnpm/uv/docker subprocesses that install it
 * first. All of them go through here.
 *
 * PATH, HOME and the interpreter settings are deliberately absent — callers
 * construct those explicitly and those values must win.
 */
const INHERITABLE_CHILD_ENV_VARS = [
  'TZ',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
] as const;

/** Proxy variables may carry `user:password@` — the child must not see those. */
const PROXY_ENV_VARS = new Set([
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'http_proxy',
  'https_proxy',
]);

/**
 * Remove any userinfo from a proxy URL, keeping the endpoint usable.
 * Returns undefined if the value cannot be parsed, so a malformed proxy setting
 * is withheld rather than forwarded blind.
 */
export function stripProxyCredentials(value: string): string | undefined {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

/** The allowlisted slice of this process's environment, for a spawned child. */
export function inheritableChildEnv(): NodeJS.ProcessEnv & { NODE_ENV: string } {
  // NODE_ENV is not a secret, and the project's ProcessEnv type requires it.
  // Callers that set it explicitly still override this.
  const inherited: NodeJS.ProcessEnv & { NODE_ENV: string } = {
    NODE_ENV: process.env.NODE_ENV ?? 'production',
  };

  for (const key of INHERITABLE_CHILD_ENV_VARS) {
    const value = process.env[key];
    if (value === undefined) {
      continue;
    }

    if (PROXY_ENV_VARS.has(key)) {
      const stripped = stripProxyCredentials(value);
      if (stripped !== undefined) {
        inherited[key] = stripped;
      }
      continue;
    }

    inherited[key] = value;
  }

  return inherited;
}
