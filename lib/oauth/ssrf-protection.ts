/**
 * SSRF (Server-Side Request Forgery) Protection
 * Validates URLs to prevent access to private networks and reserved IP ranges
 */

/**
 * Check if a hostname is a private or reserved IP address
 * Prevents SSRF attacks against internal services
 */
function isPrivateOrReservedIP(hostname: string): boolean {
  // Check for localhost variations
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.startsWith('127.') ||
    hostname === '0.0.0.0'
  ) {
    return true;
  }

  // Check for private IPv4 ranges
  const privateIPv4Ranges = [
    /^10\./, // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./, // 192.168.0.0/16
    /^169\.254\./, // Link-local (AWS/GCP metadata)
  ];

  if (privateIPv4Ranges.some((range) => range.test(hostname))) {
    return true;
  }

  // Check for private IPv6 ranges
  const privateIPv6Patterns = [
    /^fe80:/i, // Link-local
    /^fc00:/i, // Unique local addresses
    /^fd00:/i, // Unique local addresses
    /^::1$/i, // Loopback
    /^::ffff:127\./i, // IPv4-mapped loopback
  ];

  if (privateIPv6Patterns.some((pattern) => pattern.test(hostname))) {
    return true;
  }

  return false;
}

/**
 * Validate URL to prevent SSRF attacks
 * Throws error if URL points to private/reserved networks
 *
 * @param url - URL string to validate
 * @param allowPrivate - Allow private IPs (default: false) - use ONLY for testing
 * @throws Error if URL is invalid or points to restricted network
 */
export function validateUrlForSSRF(url: string, allowPrivate = false): URL {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw new Error('Invalid URL format');
  }

  // Only allow HTTP(S) protocols
  if (!parsedUrl.protocol.match(/^https?:$/)) {
    throw new Error('Only HTTP and HTTPS protocols are allowed');
  }

  // Check for private/reserved IPs unless explicitly allowed
  if (!allowPrivate && isPrivateOrReservedIP(parsedUrl.hostname)) {
    throw new Error(
      'Access to private or reserved IP ranges is not allowed for security reasons'
    );
  }

  // Additional security checks

  // Prevent URLs with credentials (username:password@host)
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('URLs with embedded credentials are not allowed');
  }

  // Warn about unusual ports (but allow them)
  const port = parsedUrl.port;
  if (port && !allowPrivate) {
    const portNum = parseInt(port, 10);
    // Flag suspicious ports commonly used for internal services
    const suspiciousPorts = [
      22, // SSH
      23, // Telnet
      25, // SMTP
      3306, // MySQL
      5432, // PostgreSQL
      6379, // Redis
      27017, // MongoDB
    ];

    if (suspiciousPorts.includes(portNum)) {
      throw new Error(
        `Port ${portNum} is commonly used for internal services and is not allowed`
      );
    }
  }

  return parsedUrl;
}

/**
 * Safe fetch with SSRF protection
 * Validates URL before making request
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param allowPrivate - Allow private IPs (default: false) - use ONLY for testing
 */
export async function safeFetch(
  url: string,
  options?: RequestInit,
  allowPrivate = false
): Promise<Response> {
  // Validate URL for SSRF
  validateUrlForSSRF(url, allowPrivate);

  // Make the fetch request
  return fetch(url, options);
}
