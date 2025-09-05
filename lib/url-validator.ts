/**
 * URL validation utilities to prevent SSRF attacks
 */

/**
 * List of allowed domains for external requests
 * Add new domains here as needed for legitimate integrations
 */
const ALLOWED_DOMAINS = [
  'registry.plugged.in',
  'api.registry.plugged.in',
  'localhost',
  '127.0.0.1',
  'github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'npmjs.org',
  'registry.npmjs.org',
  'pypi.org',
  'rubygems.org',
  'packagist.org',
  'crates.io',
  'smithery.ai',
  'server.smithery.ai',
  'api.smithery.ai',
] as const;

/**
 * List of blocked IP ranges (private networks)
 * Prevents SSRF attacks to internal network resources
 */
const BLOCKED_IP_RANGES = [
  /^10\./,                    // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
  /^192\.168\./,              // 192.168.0.0/16
  /^169\.254\./,              // 169.254.0.0/16 (link-local)
  /^127\./,                   // 127.0.0.0/8 (loopback) - except 127.0.0.1
  /^0\./,                     // 0.0.0.0/8
  /^224\./,                   // Multicast
  /^240\./,                   // Reserved
];

/**
 * Validates a URL for external requests to prevent SSRF attacks
 * 
 * @param url - The URL to validate
 * @param options - Validation options
 * @returns The validated URL object
 * @throws Error if the URL is invalid or not allowed
 */
export function validateExternalUrl(
  url: string,
  options: {
    allowedDomains?: string[];
    allowLocalhost?: boolean;
  } = {}
): URL {
  // Parse the URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw new Error(`Invalid URL format: ${url}`);
  }

  // Only allow HTTP(S) protocols
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`Invalid protocol: ${parsedUrl.protocol}. Only HTTP(S) is allowed.`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const { allowedDomains = ALLOWED_DOMAINS, allowLocalhost = false } = options;

  // Check if localhost is explicitly allowed
  if (allowLocalhost && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    return parsedUrl;
  }

  // Check against allowed domains
  const isAllowed = allowedDomains.some(domain => {
    const normalizedDomain = domain.toLowerCase();
    return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
  });

  if (!isAllowed) {
    throw new Error(`Domain not allowed: ${hostname}`);
  }

  // Additional check: prevent bypasses using IP addresses
  // Check if hostname is an IP address
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipPattern.test(hostname)) {
    // Check against blocked IP ranges
    const isBlocked = BLOCKED_IP_RANGES.some(pattern => pattern.test(hostname));
    if (isBlocked && hostname !== '127.0.0.1') {
      throw new Error(`Private IP address not allowed: ${hostname}`);
    }
  }

  // Check for URL redirection attacks
  if (parsedUrl.href.includes('@')) {
    throw new Error('URLs with authentication credentials are not allowed');
  }

  // Check for encoded characters that might bypass filters
  if (parsedUrl.href.includes('%00') || parsedUrl.href.includes('\0')) {
    throw new Error('URLs with null bytes are not allowed');
  }

  return parsedUrl;
}

/**
 * Validates a URL for internal API calls
 * More restrictive than external URL validation
 * 
 * @param url - The URL to validate
 * @returns The validated URL object
 * @throws Error if the URL is invalid
 */
export function validateInternalUrl(url: string): URL {
  return validateExternalUrl(url, {
    allowedDomains: ['registry.plugged.in', 'api.registry.plugged.in'],
    allowLocalhost: process.env.NODE_ENV === 'development',
  });
}

/**
 * Sanitizes a URL by removing potentially dangerous parts
 * 
 * @param url - The URL to sanitize
 * @returns The sanitized URL string
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove credentials, hash, and normalize
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

/**
 * Checks if a URL is from a trusted registry
 * 
 * @param url - The URL to check
 * @returns True if the URL is from a trusted registry
 */
export function isTrustedRegistryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const trustedRegistries = [
      'registry.plugged.in',
      'smithery.ai',
      'github.com',
      'npmjs.org',
      'pypi.org',
    ];
    
    return trustedRegistries.some(registry => 
      parsed.hostname === registry || parsed.hostname.endsWith(`.${registry}`)
    );
  } catch {
    return false;
  }
}