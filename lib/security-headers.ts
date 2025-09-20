/**
 * Enhanced Security Headers Configuration
 * OWASP Security Headers Best Practices
 */

/**
 * Generate a cryptographically secure nonce for CSP
 */
export function generateNonce(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for environments without crypto.randomUUID
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buffer = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Last resort fallback (not cryptographically secure)
  console.warn('Using non-secure nonce generation');
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getSecurityHeaders(isDevelopment: boolean = false, nonce?: string, isHttps: boolean = true) {
  const baseHeaders = {
    // Prevent clickjacking attacks
    'X-Frame-Options': 'DENY',

    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',

    // Control information sent with external requests
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Restrict browser features
    'Permissions-Policy':
      'camera=(), ' +
      'microphone=(), ' +
      'geolocation=(), ' +
      'interest-cohort=(), ' +
      'payment=(), ' +
      'usb=(), ' +
      'bluetooth=(), ' +
      'midi=(), ' +
      'magnetometer=(), ' +
      'gyroscope=(), ' +
      'accelerometer=()',

    // XSS Protection (legacy browsers)
    'X-XSS-Protection': '1; mode=block',

    // Prevent cross-domain policy files
    'X-Permitted-Cross-Domain-Policies': 'none',

    // DNS Prefetch Control
    'X-DNS-Prefetch-Control': 'on',

    // Download Options for IE
    'X-Download-Options': 'noopen',

    // Cache Control for sensitive pages
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  };

  // Production-specific headers
  const productionHeaders: Record<string, string> = {
    // Certificate Transparency
    'Expect-CT': 'enforce, max-age=86400',

    // Content Security Policy with dynamic nonce support
    'Content-Security-Policy': generateCSP(false, nonce || generateNonce()),
  };

  // Only add HSTS header when serving over HTTPS
  if (isHttps && !isDevelopment) {
    productionHeaders['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload';
  }

  // Development-specific headers
  const developmentHeaders = {
    'Content-Security-Policy': generateCSP(true, nonce || generateNonce()),
  };

  return {
    ...baseHeaders,
    ...(isDevelopment ? developmentHeaders : productionHeaders),
  };
}

/**
 * Generate Content Security Policy with proper directives
 */
function generateCSP(isDevelopment: boolean, nonce: string): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      isDevelopment ? "'unsafe-inline'" : `'nonce-${nonce}'`,
      // Only allow 'unsafe-eval' in development for Next.js HMR
      isDevelopment ? "'unsafe-eval'" : '',
      'https://js.stripe.com',
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
    ].filter(Boolean),
    'style-src': [
      "'self'",
      "'unsafe-inline'", // Required for styled-components/emotion
    ],
    'img-src': [
      "'self'",
      'data:',
      'https:',
      'blob:',
      'https://www.google-analytics.com',
      'https://www.googletagmanager.com',
    ],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      isDevelopment ? 'ws:' : '',
      'wss://*.plugged.in',
      'https://api.stripe.com',
      'https://*.ingest.sentry.io',
      'https://api.github.com',
      'https://www.google-analytics.com',
      'https://analytics.google.com',
      'https://www.googletagmanager.com',
    ].filter(Boolean),
    'frame-src': [
      "'self'",
      'https://js.stripe.com',
      'https://hooks.stripe.com',
    ],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'block-all-mixed-content': [],
    'upgrade-insecure-requests': isDevelopment ? [] : [''],
  };

  return Object.entries(directives)
    .filter(([, values]) => values.length > 0)
    .map(([directive, values]) => {
      if (values.length === 0) return directive;
      return `${directive} ${values.join(' ')}`;
    })
    .join('; ');
}

/**
 * Security headers for API responses
 */
export function getAPISecurityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
  };
}