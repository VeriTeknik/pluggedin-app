/**
 * Shared validation utilities for input sanitization and security
 */

import { ipLiteralFromHost, isPrivateAddress } from '@/lib/security/validators';

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

/**
 * Blocked hostnames for SSRF prevention.
 * Covers localhost aliases, cloud metadata services, and Kubernetes internal DNS.
 */
const BLOCKED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  '169.254.169.254',          // AWS/GCP/Azure IMDS
  'metadata.google.internal', // GCP metadata
  'metadata.goog',            // GCP metadata alias
  'kubernetes.default',       // Kubernetes internal
  'kubernetes.default.svc',   // Kubernetes internal
];

/**
 * Validates a service URL to prevent SSRF attacks.
 *
 * Checks:
 * - URL is parseable
 * - Protocol is http: or https:
 * - Hostname is not a blocked host (localhost, metadata, K8s internal)
 * - An IP literal is judged by the shared classifier safeFetch uses, on the
 *   parsed address, so every non-global one is refused however it is spelled
 *   (all of 127/8, bracketed and IPv4-mapped IPv6) rather than by a second set
 *   of hostname regexes (private IPs allowed in development mode)
 *
 * This reads the URL's text only. A name can still resolve anywhere, so the
 * request itself must go through safeFetch, which resolves, checks and pins
 * the address and re-validates each redirect.
 *
 * @param baseUrl - The base URL of the service (e.g., "https://models.example.com")
 * @param path - The path to append (e.g., "/health")
 * @returns The validated full URL string
 * @throws Error if the URL fails validation
 */
export function validateServiceUrl(baseUrl: string, path: string): string {
  const fullUrl = new URL(path, baseUrl);

  if (fullUrl.protocol !== 'https:' && fullUrl.protocol !== 'http:') {
    throw new Error(`Invalid URL protocol: ${fullUrl.protocol} — only http: and https: are allowed`);
  }

  // A trailing dot root-qualifies a name: `localhost.` is `localhost`.
  const hostname = fullUrl.hostname.toLowerCase().replace(/\.+$/, '');

  // Block known dangerous hostnames
  if (BLOCKED_HOSTNAMES.includes(hostname) || hostname.endsWith('.localhost')) {
    throw new Error(`Blocked URL: requests to ${hostname} are not allowed`);
  }

  // Block private/internal IP ranges (except in development)
  const isDevelopment = process.env.NODE_ENV === 'development';
  const literal = ipLiteralFromHost(hostname);
  if (!isDevelopment && literal !== null && isPrivateAddress(literal)) {
    throw new Error(`Blocked URL: requests to private network addresses are not allowed`);
  }

  return fullUrl.toString();
}
