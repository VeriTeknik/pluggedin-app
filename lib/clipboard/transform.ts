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
