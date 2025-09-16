/**
 * Centralized HTML sanitization configuration for consistent security across the application
 */
import sanitizeHtml from 'sanitize-html';

// Strict sanitization for user-generated content (no images, limited tags)
export const STRICT_SANITIZATION_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'strong', 'em', 'u', 's', 'code', 'pre',
    'blockquote', 'q',
    'ul', 'ol', 'li',
    'a',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    // No img src attributes to prevent tracking pixels
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  enforceHtmlBoundary: true,
  transformTags: {
    // All links open in new tab with security attributes
    a: (tagName, attribs) => {
      return {
        tagName: 'a',
        attribs: {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      };
    },
  },
};

// Moderate sanitization for trusted content (allows images with restrictions)
export const MODERATE_SANITIZATION_OPTIONS: sanitizeHtml.IOptions = {
  ...STRICT_SANITIZATION_OPTIONS,
  allowedTags: [
    ...(STRICT_SANITIZATION_OPTIONS.allowedTags || []),
    'img',
  ],
  allowedAttributes: {
    ...STRICT_SANITIZATION_OPTIONS.allowedAttributes,
    img: ['src', 'alt', 'width', 'height'],
  },
  allowedSchemesByTag: {
    img: ['https', 'data'], // Only HTTPS and data URIs for images
  },
  transformTags: {
    ...STRICT_SANITIZATION_OPTIONS.transformTags,
    // Add loading="lazy" to images for performance
    img: (tagName, attribs) => {
      return {
        tagName: 'img',
        attribs: {
          ...attribs,
          loading: 'lazy',
        },
      };
    },
  },
};

/**
 * Sanitize HTML content with strict rules (no images)
 * Use for all user-generated content and emails
 */
export function sanitizeStrict(html: string): string {
  return sanitizeHtml(html, STRICT_SANITIZATION_OPTIONS);
}

/**
 * Sanitize HTML content with moderate rules (allows safe images)
 * Use only for trusted content where images are necessary
 */
export function sanitizeModerate(html: string): string {
  return sanitizeHtml(html, MODERATE_SANITIZATION_OPTIONS);
}

/**
 * Remove all HTML tags and return plain text
 */
export function sanitizeToPlainText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
  });
}

/**
 * Sanitize for email subjects (no HTML allowed)
 */
export function sanitizeEmailSubject(subject: string): string {
  // Remove any HTML and limit length
  return sanitizeToPlainText(subject).substring(0, 200);
}