/**
 * YouTube Video URL Validator
 *
 * Validates and sanitizes YouTube video URLs to prevent XSS attacks
 * through iframe embedding. Only allows official YouTube domains with
 * proper embed URL format.
 */

/**
 * Allowed YouTube domains for iframe embedding
 */
const ALLOWED_YOUTUBE_DOMAINS = [
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
];

/**
 * Allowed query parameters for YouTube embed URLs
 */
const ALLOWED_QUERY_PARAMS = [
  'start',        // Start time in seconds
  'end',          // End time in seconds
  'autoplay',     // Auto-play video (0 or 1)
  'mute',         // Mute video (0 or 1)
  'loop',         // Loop video (0 or 1)
  'controls',     // Show controls (0 or 1)
  'rel',          // Show related videos (0 or 1)
  'modestbranding', // Modest branding (1)
  'playsinline',  // Play inline on mobile (1)
];

/**
 * Result of URL validation
 */
export interface VideoUrlValidationResult {
  isValid: boolean;
  sanitizedUrl?: string;
  error?: string;
}

/**
 * Validates a YouTube video URL for safe iframe embedding
 *
 * @param url - The URL to validate
 * @returns Validation result with sanitized URL if valid
 *
 * @example
 * ```typescript
 * const result = validateYouTubeUrl('https://www.youtube.com/embed/VIDEO_ID?start=123');
 * if (result.isValid) {
 *   // Use result.sanitizedUrl safely
 * }
 * ```
 */
export function validateYouTubeUrl(url: string): VideoUrlValidationResult {
  // Check for empty or invalid input
  if (!url || typeof url !== 'string') {
    return {
      isValid: false,
      error: 'URL is required and must be a string',
    };
  }

  // Prevent common XSS attack vectors
  const lowerUrl = url.toLowerCase().trim();

  if (lowerUrl.startsWith('javascript:') ||
      lowerUrl.startsWith('data:') ||
      lowerUrl.startsWith('vbscript:')) {
    return {
      isValid: false,
      error: 'Invalid URL scheme detected',
    };
  }

  // Parse the URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    return {
      isValid: false,
      error: 'Invalid URL format',
    };
  }

  // Validate protocol (only https)
  if (parsedUrl.protocol !== 'https:') {
    return {
      isValid: false,
      error: 'Only HTTPS protocol is allowed',
    };
  }

  // Validate domain
  if (!ALLOWED_YOUTUBE_DOMAINS.includes(parsedUrl.hostname)) {
    return {
      isValid: false,
      error: `Domain must be one of: ${ALLOWED_YOUTUBE_DOMAINS.join(', ')}`,
    };
  }

  // Validate path (must be /embed/VIDEO_ID with optional additional parameters)
  const pathMatch = parsedUrl.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})(?:[/?].*)?$/);
  if (!pathMatch) {
    return {
      isValid: false,
      error: 'URL must be in format: /embed/VIDEO_ID (with optional parameters)',
    };
  }

  const videoId = pathMatch[1];

  // Validate video ID format (YouTube video IDs are 11 characters, alphanumeric, underscore, or hyphen)
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return {
      isValid: false,
      error: 'Invalid YouTube video ID format',
    };
  }

  // Sanitize query parameters
  const sanitizedParams = new URLSearchParams();
  const originalParams = new URLSearchParams(parsedUrl.search);

  for (const [key, value] of originalParams) {
    if (ALLOWED_QUERY_PARAMS.includes(key)) {
      // Validate numeric parameters
      if (['start', 'end'].includes(key)) {
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue) && numValue >= 0) {
          sanitizedParams.set(key, numValue.toString());
        }
      }
      // Validate boolean parameters (0 or 1)
      else if (['autoplay', 'mute', 'loop', 'controls', 'rel', 'modestbranding', 'playsinline'].includes(key) && (value === '0' || value === '1')) {
        sanitizedParams.set(key, value);
      }
    }
  }

  // Construct sanitized URL
  const sanitizedUrl = new URL(`https://${parsedUrl.hostname}/embed/${videoId}`);
  const paramsString = sanitizedParams.toString();
  if (paramsString) {
    sanitizedUrl.search = paramsString;
  }

  return {
    isValid: true,
    sanitizedUrl: sanitizedUrl.toString(),
  };
}

/**
 * Validates a YouTube URL and returns the sanitized URL or a fallback
 *
 * @param url - The URL to validate
 * @param fallback - Fallback URL if validation fails (optional)
 * @returns Sanitized URL or fallback
 *
 * @example
 * ```typescript
 * const safeUrl = getSafeYouTubeUrl(userUrl, 'https://www.youtube.com/embed/dQw4w9WgXcQ');
 * ```
 */
export function getSafeYouTubeUrl(url: string, fallback?: string): string | null {
  const result = validateYouTubeUrl(url);

  if (result.isValid && result.sanitizedUrl) {
    return result.sanitizedUrl;
  }

  // Log validation errors in development
  if (process.env.NODE_ENV === 'development' && result.error) {
    console.warn(`[VideoUrlValidator] ${result.error}: ${url}`);
  }

  return fallback || null;
}

/**
 * Batch validates multiple YouTube URLs
 *
 * @param urls - Array of URLs to validate
 * @returns Array of validation results
 */
export function validateYouTubeUrls(urls: string[]): VideoUrlValidationResult[] {
  return urls.map(url => validateYouTubeUrl(url));
}
