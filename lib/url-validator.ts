/**
 * URL validation utilities to prevent SSRF attacks
 */

/**
 * List of allowed domains for external requests
 * Add new domains here as needed for legitimate integrations
 */
const ALLOWED_DOMAINS = [
  'plugged.in',
  'api.plugged.in',
  'registry.plugged.in',
  'api.registry.plugged.in',
  'staging.plugged.in',
  'api.staging.plugged.in',
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
 * Development-only allowed domains
 * These are only allowed when NODE_ENV === 'development'
 */
const DEV_ALLOWED_DOMAINS = [
  'localhost',
  '127.0.0.1',
  '::1',
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
  /^127\./,                   // 127.0.0.0/8 (loopback)
  /^0\./,                     // 0.0.0.0/8
  /^224\./,                   // Multicast
  /^240\./,                   // Reserved
];

/**
 * IPv6 patterns to block
 */
const BLOCKED_IPV6_PATTERNS = [
  /^::1$/,                     // Loopback
  /^0000:0000:0000:0000:0000:0000:0000:0001$/i, // Loopback (full form)
  /^fe80:/i,                   // Link-local
  /^fc00:/i,                   // Unique local
  /^fd[0-9a-f]{2}:/i,         // Unique local
  /^ff[0-9a-f]{2}:/i,         // Multicast
  /^::/,                       // Unspecified
];

/**
 * Validates a URL for external requests to prevent SSRF attacks
 * 
 * Security features:
 * - Blocks private IP ranges (RFC 1918)
 * - Blocks IPv6 private/local addresses
 * - Prevents credential injection
 * - Enforces domain allowlisting
 * - Blocks non-HTTP(S) protocols
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
  
  // Build the allowed domains list based on environment and options
  let effectiveAllowedDomains = [...(options.allowedDomains || ALLOWED_DOMAINS)];
  
  // Add development domains if in development mode or explicitly allowed
  const { allowLocalhost = process.env.NODE_ENV === 'development' } = options;
  if (allowLocalhost) {
    effectiveAllowedDomains = [...effectiveAllowedDomains, ...DEV_ALLOWED_DOMAINS];
  }
  
  const { allowedDomains = effectiveAllowedDomains } = options;

  // Check if localhost is explicitly allowed
  if (allowLocalhost && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1')) {
    return parsedUrl;
  }

  // Check if hostname is an IPv4 address FIRST before domain checking
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Pattern.test(hostname)) {
    // Validate each octet is in valid range (0-255)
    const octets = hostname.split('.').map(Number);
    if (octets.some(octet => octet > 255)) {
      throw new Error(`Invalid IP address: ${hostname}`);
    }
    
    // Check against blocked IP ranges
    const isBlocked = BLOCKED_IP_RANGES.some(pattern => pattern.test(hostname));
    if (isBlocked) {
      // Allow 127.0.0.1 only if localhost is explicitly allowed
      if (hostname === '127.0.0.1' && allowLocalhost) {
        return parsedUrl;
      }
      throw new Error(`Private IP address not allowed: ${hostname}`);
    }
    
    // If it's an IP and not blocked, still check if it's in allowed domains
    // Most IPs won't be in allowed domains list
    const isAllowed = allowedDomains.some(domain => {
      const normalizedDomain = domain.toLowerCase();
      return hostname === normalizedDomain;
    });
    
    if (!isAllowed) {
      throw new Error(`Domain not allowed: ${hostname}`);
    }
    
    return parsedUrl;
  }
  
  // Check if hostname is an IPv6 address (with or without brackets)
  const ipv6Hostname = hostname.replace(/^\[|\]$/g, '');
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/;
  const compressedIpv6Pattern = /^::([0-9a-fA-F]{0,4}:){0,6}[0-9a-fA-F]{0,4}$|^([0-9a-fA-F]{0,4}:){1,6}:$/;
  
  if (ipv6Pattern.test(ipv6Hostname) || compressedIpv6Pattern.test(ipv6Hostname) || hostname === '[::1]') {
    // Check against blocked IPv6 patterns
    const isBlockedIpv6 = BLOCKED_IPV6_PATTERNS.some(pattern => pattern.test(ipv6Hostname));
    if (isBlockedIpv6) {
      // Allow ::1 only if localhost is explicitly allowed
      if (ipv6Hostname === '::1' && allowLocalhost) {
        return parsedUrl;
      }
      throw new Error(`Private IPv6 address not allowed: ${hostname}`);
    }
    
    // If not explicitly blocked, still check allowed domains for other IPv6
    const isInAllowedDomains = allowedDomains.some(domain => 
      hostname === domain || hostname === `[${domain}]` || ipv6Hostname === domain
    );
    if (!isInAllowedDomains) {
      throw new Error(`IPv6 address not in allowed domains: ${hostname}`);
    }
    
    return parsedUrl;
  }
  
  // For regular domain names, check against allowed list
  const isAllowed = allowedDomains.some(domain => {
    const normalizedDomain = domain.toLowerCase();
    return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
  });

  if (!isAllowed) {
    throw new Error(`Domain not allowed: ${hostname}`);
  }

  // Check for URL redirection attacks
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('URLs with authentication credentials are not allowed');
  }

  // Check for encoded characters that might bypass filters
  // Check both the original URL and the parsed href
  if (url.includes('%00') || url.includes('\0') || 
      parsedUrl.href.includes('%00') || parsedUrl.href.includes('\0')) {
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
  console.log('[validateInternalUrl] Validating URL:', url);
  console.log('[validateInternalUrl] NODE_ENV:', process.env.NODE_ENV);
  try {
    const validated = validateExternalUrl(url, {
      allowedDomains: [
        'registry.plugged.in',
        'api.registry.plugged.in',
        'staging.plugged.in',
        'api.staging.plugged.in'
      ],
      allowLocalhost: process.env.NODE_ENV === 'development',
    });
    console.log('[validateInternalUrl] Validation successful:', validated.toString());
    return validated;
  } catch (error) {
    console.error('[validateInternalUrl] Validation failed:', error);
    throw error;
  }
}

/**
 * Sanitizes a URL by removing potentially dangerous parts
 * 
 * @param url - The URL to sanitize
 * @returns The sanitized URL string or null if invalid
 */
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    
    // Check for dangerous protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    
    // Remove credentials, hash, and normalize
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    return parsed.toString();
  } catch (error) {
    // Return null for invalid URLs so callers can handle explicitly
    return null;
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