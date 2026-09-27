/**
 * Package identifier validation for the MCP package managers.
 *
 * The name and version reaching pnpm/uv/docker come out of a user-supplied
 * `args` array, so they are attacker-controlled. The handlers now use argv
 * execution rather than a shell, which is the real fix; these checks are the
 * second layer, and they also keep a malformed name out of the filesystem-path
 * builders that consume the same value.
 *
 * Deliberately an allowlist. A denylist of shell metacharacters is a guess
 * about which characters matter to which interpreter; a grammar is a statement
 * about what a package name actually is.
 */

/**
 * npm (`@scope/name`, and `name@version` - the `@` recurs, which is what
 * `@smithery/cli@latest` needs), PyPI (`name`, `name.sub`) and Docker image
 * references (`registry/host:port/path`, `image:tag`) share this shape:
 * alphanumerics plus `. _ - / : @` and nothing else. No whitespace, no quotes,
 * no metacharacters.
 */
const PACKAGE_NAME_PATTERN = /^[a-zA-Z0-9@][a-zA-Z0-9._\-/:@]*$/;

/** Semver ranges, dist-tags and Docker tags: `1.2.3`, `^2.0.0`, `latest`, `20-alpine`. */
const PACKAGE_VERSION_PATTERN = /^[a-zA-Z0-9~^><=*][a-zA-Z0-9._\-+]*$/;

const MAX_PACKAGE_NAME_LENGTH = 214; // npm's documented maximum
const MAX_PACKAGE_VERSION_LENGTH = 128;

/**
 * Specs that are not a registry name but that pnpm and uv accept in the same
 * position, and then fetch or read themselves: `http://…/x.tgz`, `git://…`,
 * `github:owner/repo`, `npm:alias`, `file:…`. The installers run on the host
 * before the MCP sandbox exists and none of these go through safeFetch, so a
 * name that parses as one of them is an SSRF primitive, not a package.
 *
 * The grammar above cannot tell them apart from a Docker `image:tag` - both are
 * "letters, colon, more letters" - so the fetchable forms are named here.
 */
const FETCHABLE_SPEC_PATTERN =
  /:\/\/|^(?:git\+|git:|github:|gitlab:|bitbucket:|gist:|file:|link:|npm:|workspace:|portal:|patch:|https?:|ssh:|ftp:)/i;

/** scp-style git remotes, `user@host.tld:path` - npm-package-arg's own test. */
const SCP_GIT_SPEC_PATTERN = /^[^@]+@[^:.]+\.[^:]+:.+$/;

/**
 * An npm registry name: `name` or `@scope/name`. Nothing else is a name to npm -
 * an unscoped `owner/repo` is a GitHub fetch, and anything with a colon is a
 * protocol. The first character is alphanumeric so a name is never an option.
 */
const NPM_NAME_PATTERN = /^(?:@[a-zA-Z0-9][a-zA-Z0-9._-]*\/)?[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * A PyPI distribution name (PEP 508 / PEP 503). No `@` - `name@url` is a PEP 508
 * direct reference, the URL form in disguise - and no `/` or `:`.
 */
const PYTHON_NAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/**
 * Names the installers read as a local archive instead of a registry lookup.
 * `evil.tar.gz` matches the PyPI grammar, and `evil.tgz` the npm one.
 */
const LOCAL_ARCHIVE_PATTERN = /\.(?:tgz|tar|tar\.gz|tar\.bz2|tar\.xz|zip|whl|egg)$/i;

export function validatePackageName(name: unknown): { valid: boolean; error?: string } {
  if (typeof name !== 'string' || name.length === 0) {
    return { valid: false, error: 'Package name must be a non-empty string' };
  }

  if (name.length > MAX_PACKAGE_NAME_LENGTH) {
    return {
      valid: false,
      error: `Package name too long: maximum ${MAX_PACKAGE_NAME_LENGTH} characters allowed`,
    };
  }

  if (!PACKAGE_NAME_PATTERN.test(name)) {
    return {
      valid: false,
      error: 'Package name may only contain letters, digits and . _ - / : @',
    };
  }

  // `..` would escape the per-server install directory once the name is used to
  // build a path, which several handlers do.
  if (name.includes('..')) {
    return { valid: false, error: 'Package name cannot contain ".."' };
  }

  if (FETCHABLE_SPEC_PATTERN.test(name) || SCP_GIT_SPEC_PATTERN.test(name)) {
    return {
      valid: false,
      error: 'Package name must be a registry name, not a URL, VCS or path spec',
    };
  }

  return { valid: true };
}

/**
 * An npm registry package, optionally pinned: `name`, `@scope/name`,
 * `name@1.2.3`, `@scope/name@latest`. Used where the value goes to pnpm, which
 * resolves every other spec form (URL, git, GitHub shorthand, alias, local
 * tarball) by fetching or reading it itself.
 */
export function validateNpmPackageSpec(spec: unknown): { valid: boolean; error?: string } {
  const base = validatePackageName(spec);
  if (!base.valid) {
    return base;
  }

  const value = spec as string;
  // The version separator is the first `@` after the scope's own.
  const versionAt = value.indexOf('@', value.startsWith('@') ? 1 : 0);
  const name = versionAt === -1 ? value : value.slice(0, versionAt);
  const version = versionAt === -1 ? undefined : value.slice(versionAt + 1);

  if (!NPM_NAME_PATTERN.test(name) || LOCAL_ARCHIVE_PATTERN.test(name)) {
    return { valid: false, error: 'Not an npm registry package name' };
  }

  if (version !== undefined && !validatePackageVersion(version).valid) {
    return { valid: false, error: 'Not an npm registry version, range or tag' };
  }

  return { valid: true };
}

/**
 * A PyPI distribution name. Used where the value goes to `uv pip install`,
 * which treats a URL, a `name@url` direct reference, a path or an archive
 * filename as something to fetch or read rather than look up.
 */
export function validatePythonPackageName(name: unknown): { valid: boolean; error?: string } {
  const base = validatePackageName(name);
  if (!base.valid) {
    return base;
  }

  const value = name as string;
  if (!PYTHON_NAME_PATTERN.test(value) || LOCAL_ARCHIVE_PATTERN.test(value)) {
    return { valid: false, error: 'Not a PyPI distribution name' };
  }

  return { valid: true };
}

export function validatePackageVersion(version: unknown): { valid: boolean; error?: string } {
  if (typeof version !== 'string' || version.length === 0) {
    return { valid: false, error: 'Package version must be a non-empty string' };
  }

  if (version.length > MAX_PACKAGE_VERSION_LENGTH) {
    return {
      valid: false,
      error: `Package version too long: maximum ${MAX_PACKAGE_VERSION_LENGTH} characters allowed`,
    };
  }

  if (!PACKAGE_VERSION_PATTERN.test(version)) {
    return {
      valid: false,
      error: 'Package version may only contain letters, digits and . _ - + ~ ^ > < = *',
    };
  }

  return { valid: true };
}
