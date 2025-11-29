/**
 * Client-safe clipboard utilities
 * These can be imported in client components without server-side dependencies
 */

/**
 * Whitelist of safe image content types for rendering in data URLs
 * This prevents XSS attacks by disallowing arbitrary content types like text/html
 * which could execute scripts when rendered in an img src attribute
 */
const SAFE_IMAGE_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml', // Note: SVG could contain scripts but browser sandboxing in img prevents execution
  'image/bmp',
  'image/ico',
  'image/x-icon',
  'image/avif',
  'image/apng',
]);

/**
 * Check if a content type is a safe image type for rendering
 * Only whitelisted image types are allowed to prevent XSS via data URLs
 *
 * @param contentType - The MIME content type to check
 * @returns true if the content type is a safe, whitelisted image type
 */
export function isSafeImageType(contentType: string): boolean {
  return SAFE_IMAGE_CONTENT_TYPES.has(contentType.toLowerCase());
}

/**
 * Build a safe data URL for image rendering
 * Returns null if the content type is not a safe image type
 *
 * @param contentType - The MIME content type
 * @param encoding - The encoding (base64, utf-8, hex)
 * @param value - The encoded image data
 * @returns Safe data URL string or null if unsafe
 */
export function buildSafeImageDataUrl(
  contentType: string,
  encoding: string,
  value: string
): string | null {
  if (!isSafeImageType(contentType)) {
    return null;
  }
  return `data:${contentType};${encoding},${value}`;
}

/**
 * Check if a clipboard entry is text-like and safe to copy as plain text
 * Used to determine if we should allow copying via navigator.clipboard.writeText
 */
export function isTextLikeEntry(entry: { contentType: string; encoding?: string }): boolean {
  const contentType = entry.contentType ?? '';
  const encoding = entry.encoding?.toLowerCase();

  // Text MIME types
  if (contentType.startsWith('text/')) return true;

  // Common text-ish types that are usually UTF-8
  if (
    contentType === 'application/json' ||
    contentType === 'application/xml' ||
    contentType === 'application/xhtml+xml'
  ) {
    return true;
  }

  // If explicitly marked UTF-8, treat as text
  if (encoding === 'utf-8' || encoding === 'utf8') return true;

  return false;
}

/**
 * Clipboard source display configuration
 * Maps source values to their display properties (label key, badge variant)
 */
export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

export interface SourceDisplayConfig {
  labelKey: string;
  variant: BadgeVariant;
}

export const CLIPBOARD_SOURCE_DISPLAY: Record<string, SourceDisplayConfig> = {
  mcp: { labelKey: 'clipboard.preview.sourceMcp', variant: 'default' },
  sdk: { labelKey: 'clipboard.preview.sourceSdk', variant: 'secondary' },
  ui: { labelKey: 'clipboard.preview.sourceUi', variant: 'outline' },
};

/**
 * Get display configuration for a clipboard source
 * Returns default UI config if source is not recognized
 */
export function getSourceDisplayConfig(source: string | undefined): SourceDisplayConfig {
  if (!source || !(source in CLIPBOARD_SOURCE_DISPLAY)) {
    return CLIPBOARD_SOURCE_DISPLAY.ui;
  }
  return CLIPBOARD_SOURCE_DISPLAY[source];
}

/**
 * Format a date string or Date object for display
 * Uses browser's locale for formatting
 *
 * @param date - ISO date string or Date object
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string or fallback value
 */
export function formatClipboardDate(
  date: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: 'short',
    timeStyle: 'short',
  }
): string {
  if (!date) return '-';

  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleString(undefined, options);
  } catch {
    return '-';
  }
}
