/**
 * Clipboard shared utilities
 * Centralizes constants, query builders, and transformations
 */

export {
  MAX_CLIPBOARD_SIZE_BYTES,
  DEFAULT_CLIPBOARD_TTL_MS,
  calculateClipboardSize,
  validateClipboardSize,
  calculateExpirationDate,
} from './constants';

export {
  buildClipboardConditions,
  cleanupExpiredClipboards,
  cleanupAllExpiredClipboards,
  type ClipboardFilter,
} from './queries';

export {
  toClipboardEntry,
  toClipboardEntries,
  type ClipboardRow,
  type ClipboardEntry,
  type TransformOptions,
} from './transform';

// Client-safe utility for checking text-like entries
export { isTextLikeEntry, isSafeImageType, buildSafeImageDataUrl } from './client';
