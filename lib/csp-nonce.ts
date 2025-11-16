import { headers } from 'next/headers';

/**
 * CSP Nonce Utility for Next.js 15+
 *
 * Provides Content Security Policy nonce generation and retrieval
 * for eliminating unsafe-inline and unsafe-eval directives.
 *
 * Compatible with Edge Runtime (uses Web Crypto API)
 *
 * Usage in middleware:
 * 1. Generate nonce in middleware
 * 2. Add to response headers
 * 3. Store in request headers for retrieval
 *
 * Usage in components:
 * ```tsx
 * import { getNonce } from '@/lib/csp-nonce';
 *
 * export default function Page() {
 *   const nonce = getNonce();
 *   return <script nonce={nonce}>...</script>
 * }
 * ```
 */

/**
 * Generate a cryptographically secure nonce using Web Crypto API
 * Compatible with Edge Runtime
 */
export function generateNonce(): string {
  // Use Web Crypto API for Edge Runtime compatibility
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);

  // Convert to base64
  return btoa(String.fromCharCode(...array));
}

/**
 * Get the nonce from headers (set by middleware)
 * Returns undefined in development or if not available
 */
export async function getNonce(): Promise<string | undefined> {
  try {
    const headersList = await headers();
    return headersList.get('x-nonce') || undefined;
  } catch (error) {
    // Headers not available (e.g., client component, static generation)
    return undefined;
  }
}

/**
 * Build CSP header with nonce
 */
export function buildCSPWithNonce(nonce: string, isDevelopment: boolean): string {
  const baseCSP = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDevelopment ? ["'unsafe-eval'"] : []), // Allow eval in development for HMR
      'https://js.stripe.com',
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
      'https://cdn.jsdelivr.net',
    ],
    'style-src': [
      "'self'",
      // For styled-jsx and CSS-in-JS libraries, we need unsafe-inline
      // Nonce is omitted because when present, it causes unsafe-inline to be ignored per CSP spec
      // This is a known limitation but much safer than script unsafe-inline
      "'unsafe-inline'",
      'https://cdn.jsdelivr.net',
    ],
    'img-src': [
      "'self'",
      'data:',
      'https:',
      'blob:',
      'https://www.google-analytics.com',
      'https://www.googletagmanager.com',
    ],
    'font-src': ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
    'connect-src': [
      "'self'",
      'ws:',
      'wss:',
      'https://api.stripe.com',
      'wss://*.plugged.in',
      'https://*.ingest.sentry.io',
      'https://*.ingest.de.sentry.io',
      'https://api.github.com',
      'https://www.google-analytics.com',
      'https://analytics.google.com',
      'https://www.googletagmanager.com',
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
      'https://*.googletagmanager.com',
      'https://cdn.jsdelivr.net',
    ],
    'frame-src': [
      "'self'",
      'https://js.stripe.com',
      'https://hooks.stripe.com',
      'https://www.youtube.com',
      'https://youtube.com',
      'https://www.youtube-nocookie.com',
    ],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };

  // Build CSP string
  const cspString = Object.entries(baseCSP)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');

  // Add production-only directives
  return isDevelopment ? cspString : `${cspString}; upgrade-insecure-requests`;
}
