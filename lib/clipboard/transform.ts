/**
 * Shared clipboard transformation helpers
 * Centralizes DB row to response mapping
 */

import type { InferSelectModel } from 'drizzle-orm';

import { clipboardsTable } from '@/db/schema';

export type ClipboardRow = InferSelectModel<typeof clipboardsTable>;

export interface ClipboardEntry {
  uuid: string;
  name: string | null;
  idx: number | null;
  value: string;
  contentType: string;
  encoding: string;
  sizeBytes: number;
  visibility: string;
  createdByTool: string | null;
  createdByModel: string | null;
  source: string;
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
    encoding: row.encoding,
    sizeBytes: row.size_bytes,
    visibility: row.visibility,
    createdByTool: row.created_by_tool,
    createdByModel: row.created_by_model,
    source: row.source,
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
