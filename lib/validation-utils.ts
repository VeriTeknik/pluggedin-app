/**
 * Shared validation utilities for input sanitization and security
 */

/**
 * Validates external IDs to prevent SSRF and path traversal attacks
 *
 * Security considerations:
 * - Only allows alphanumeric characters, hyphens, underscores, and dots
 * - The regex pattern /^[a-zA-Z0-9._-]+$/ inherently blocks slashes (/ and \)
 * - Additional check for ".." prevents path traversal (e.g., "../../../etc/passwd")
 * - Defense-in-depth: Even though regex blocks invalid chars, we explicitly check ".."
 *   to make the security intent clear and guard against regex errors
 *
 * @param externalId - The external ID to validate (e.g., from MCP registry)
 * @returns true if the ID is safe to use in URL paths or file operations
 *
 * @example
 * validateExternalId('my-server-123')  // true
 * validateExternalId('my.server_v2')   // true
 * validateExternalId('../etc/passwd')  // false (blocked by regex)
 * validateExternalId('server/path')    // false (blocked by regex)
 * validateExternalId('..')             // false (blocked by explicit check)
 */
export function validateExternalId(externalId: string | null | undefined): boolean {
  if (!externalId) {
    return false;
  }

  // Only allow alphanumeric characters, hyphens, underscores, and dots
  // This pattern inherently blocks slashes (/ and \) and most path traversal attempts
  const safeIdPattern = /^[a-zA-Z0-9._-]+$/;
  if (!safeIdPattern.test(externalId)) {
    return false;
  }

  // Defense-in-depth: Explicitly prevent ".." sequences for path traversal protection
  // Even though the regex would catch most cases, this makes the security intent explicit
  // and protects against potential regex bugs or changes
  if (externalId.includes('..')) {
    return false;
  }

  return true;
}

/**
 * Validates and sanitizes external IDs with detailed error logging
 *
 * @param externalId - The external ID to validate
 * @param context - Context for logging (e.g., 'reviews', 'server-fetch')
 * @returns true if valid, false otherwise (with console error logging)
 */
export function validateExternalIdWithLogging(
  externalId: string | null | undefined,
  context: string = 'validation'
): boolean {
  if (!externalId) {
    console.error(`[${context}] External ID is null or empty`);
    return false;
  }

  const safeIdPattern = /^[a-zA-Z0-9._-]+$/;
  if (!safeIdPattern.test(externalId)) {
    console.error(`[${context}] Invalid external ID format:`, externalId);
    return false;
  }

  if (externalId.includes('..')) {
    console.error(`[${context}] Path traversal attempt detected in external ID:`, externalId);
    return false;
  }

  return true;
}
