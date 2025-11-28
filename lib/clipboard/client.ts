/**
 * Client-safe clipboard utilities
 * These can be imported in client components without server-side dependencies
 */

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
