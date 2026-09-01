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
 * npm (`@scope/name`), PyPI (`name`, `name.sub`) and Docker image references
 * (`registry/host:port/path`, `image:tag`) share this shape: alphanumerics plus
 * `. _ - / : @` and nothing else. No whitespace, no quotes, no metacharacters.
 */
const PACKAGE_NAME_PATTERN = /^[a-zA-Z0-9@][a-zA-Z0-9._\-/:]*$/;

/** Semver ranges, dist-tags and Docker tags: `1.2.3`, `^2.0.0`, `latest`, `20-alpine`. */
const PACKAGE_VERSION_PATTERN = /^[a-zA-Z0-9~^><=*][a-zA-Z0-9._\-+]*$/;

const MAX_PACKAGE_NAME_LENGTH = 214; // npm's documented maximum
const MAX_PACKAGE_VERSION_LENGTH = 128;

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
