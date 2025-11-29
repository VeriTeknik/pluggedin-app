/**
 * Shared clipboard transformation helpers
 * Centralizes DB row to response mapping
 */

import type { InferSelectModel } from 'drizzle-orm';

import { clipboardsTable } from '@/db/schema';

export type ClipboardRow = InferSelectModel<typeof clipboardsTable>;

/**
 * Clipboard source types - shared across API, schema, and UI
 */
export const CLIPBOARD_SOURCES = ['ui', 'sdk', 'mcp'] as const;
export type ClipboardSource = typeof CLIPBOARD_SOURCES[number];

/** Default source for backward compatibility with older data */
export const DEFAULT_CLIPBOARD_SOURCE: ClipboardSource = 'ui';

/**
 * Clipboard visibility types
 */
export const CLIPBOARD_VISIBILITIES = ['private', 'workspace', 'public'] as const;
export type ClipboardVisibility = typeof CLIPBOARD_VISIBILITIES[number];

/**
 * Clipboard encoding types
 */
export const CLIPBOARD_ENCODINGS = ['utf-8', 'base64', 'hex'] as const;
export type ClipboardEncoding = typeof CLIPBOARD_ENCODINGS[number];

export interface ClipboardEntry {
  uuid: string;
  name: string | null;
  idx: number | null;
  value: string;
  contentType: string;
  encoding: ClipboardEncoding;
  sizeBytes: number;
  visibility: ClipboardVisibility;
  createdByTool: string | null;
  createdByModel: string | null;
  source: ClipboardSource;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export type TransformOptions = {
  /** Truncate image values for list views */
  thumbnailForImages?: boolean;
  /** Include full value in response */
  includeFullValue?: boolean;
};

/**
 * Transform a database row to a clipboard entry response
 */
export function toClipboardEntry(
  row: ClipboardRow,
  options: TransformOptions = {}
): ClipboardEntry {
  const { thumbnailForImages = false } = options;
  const isImage = row.content_type.startsWith('image/');

  return {
    uuid: row.uuid,
    name: row.name,
    idx: row.idx,
    value: thumbnailForImages && isImage
      ? row.value.substring(0, 1000)
      : row.value,
    contentType: row.content_type,
    encoding: row.encoding as ClipboardEncoding,
    sizeBytes: row.size_bytes,
    visibility: row.visibility as ClipboardVisibility,
    createdByTool: row.created_by_tool,
    createdByModel: row.created_by_model,
    source: (row.source as ClipboardSource) ?? DEFAULT_CLIPBOARD_SOURCE,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    expiresAt: row.expires_at?.toISOString() ?? null,
  };
}

/**
 * Transform multiple database rows to clipboard entries
 */
export function toClipboardEntries(
  rows: ClipboardRow[],
  options: TransformOptions = {}
): ClipboardEntry[] {
  return rows.map((row) => toClipboardEntry(row, options));
}

// Note: isTextLikeEntry is defined in client.ts to allow client-side imports
// Re-exported from index.ts for convenience
