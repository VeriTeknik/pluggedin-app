/**
 * Security utilities for preventing XSS and other vulnerabilities
 */

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(str: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
  };
  
  return str.replace(/[&<>"'/]/g, (char) => htmlEscapes[char] || char);
}

/**
 * Safely encode data for JavaScript contexts
 * Use this when embedding data in <script> tags
 */
export function encodeForJavaScript(data: any): string {
  // JSON.stringify handles escaping for JS contexts
  // Additional escaping for </script> tag injection and HTML comments
  return JSON.stringify(data)
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '\\u003C!\\u002D\\u002D')
    .replace(/--!?>/g, '\\u002D\\u002D\\u003E');
}

/**
 * Validate and sanitize URLs to prevent open redirect attacks
 */
export function isValidRedirectUrl(url: string, allowedHosts: string[]): boolean {
  try {
    const parsed = new URL(url);
    
    // Check protocol (only allow http/https)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    
    // Check if host is in allowed list
    return allowedHosts.some(host => {
      // Support wildcards like *.example.com
      if (host.startsWith('*.')) {
        const domain = host.slice(2);
        return parsed.hostname === domain || parsed.hostname.endsWith('.' + domain);
      }
      return parsed.hostname === host;
    });
  } catch {
    // Invalid URL
    return false;
  }
}

/**
 * Get allowed redirect hosts from environment
 */
export function getAllowedRedirectHosts(): string[] {
  const hosts = [
    'localhost',
    '127.0.0.1',
    'plugged.in',
    'www.plugged.in',
    'app.plugged.in',
  ];
  
  // Add custom allowed hosts from environment
  const customHosts = process.env.ALLOWED_REDIRECT_HOSTS?.split(',').map(h => h.trim()) || [];
  hosts.push(...customHosts);
  
  // Add the current domain from NEXTAUTH_URL
  if (process.env.NEXTAUTH_URL) {
    try {
      const url = new URL(process.env.NEXTAUTH_URL);
      hosts.push(url.hostname);
    } catch {
      // Invalid URL, ignore
    }
  }
  
  return Array.from(new Set(hosts)); // Remove duplicates
}

/**
 * Validate origin for postMessage
 */
export function isValidMessageOrigin(origin: string): boolean {
  const allowedOrigins = [
    process.env.NEXTAUTH_URL?.replace(/\/$/, ''),
    'http://localhost:12005',
    'http://localhost:3000',
    'https://plugged.in',
    'https://www.plugged.in',
    'https://app.plugged.in',
  ].filter(Boolean);
  
  return allowedOrigins.includes(origin);
}

/**
 * Generate a secure random state parameter for OAuth
 */
export function generateOAuthState(): string {
  // In a real implementation, use crypto.randomBytes
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}

/**
 * Generate a secure nonce for CSP
 */
export function generateNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
}

/**
 * Create a Content Security Policy header
 */
export function getCSPHeader(nonce?: string): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' ${nonce ? `'nonce-${nonce}'` : "'unsafe-inline'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "script-src-attr 'none'",
    "upgrade-insecure-requests",
  ];
  
  return directives.join('; ');
}

/**
 * Get security headers for HTML responses
 */
export function getSecurityHeaders(nonce?: string): Record<string, string> {
  return {
    'Content-Security-Policy': getCSPHeader(nonce),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

/**
 * Sanitize error messages to prevent information disclosure
 */
export function sanitizeErrorMessage(error: unknown): string {
  // Log the full error server-side
  console.error('Full error details:', error);
  
  // Return generic message to user
  if (error instanceof Error) {
    // Check for specific error types that are safe to show
    if (error.message.includes('rate limit')) {
      return 'Too many requests. Please try again later.';
    }
    if (error.message.includes('unauthorized') || error.message.includes('authentication')) {
      return 'Authentication failed. Please try again.';
    }
  }
  
  // Generic error message
  return 'An error occurred. Please try again later.';
}