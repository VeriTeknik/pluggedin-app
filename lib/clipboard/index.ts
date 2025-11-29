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
  validateContentEncoding,
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
  CLIPBOARD_SOURCES,
  CLIPBOARD_VISIBILITIES,
  CLIPBOARD_ENCODINGS,
  type ClipboardRow,
  type ClipboardEntry,
  type ClipboardSource,
  type ClipboardVisibility,
  type ClipboardEncoding,
  type TransformOptions,
} from './transform';

// Client-safe utilities
export {
  isTextLikeEntry,
  isSafeImageType,
  buildSafeImageDataUrl,
  getSourceDisplayConfig,
  formatClipboardDate,
  CLIPBOARD_SOURCE_DISPLAY,
  type BadgeVariant,
  type SourceDisplayConfig,
} from './client';
