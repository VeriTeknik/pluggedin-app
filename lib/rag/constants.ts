/**
 * Shared RAG constants used across library actions, UI components, and services.
 */

/** MIME types that can be processed through the RAG pipeline (text extraction + chunking + embedding). */
export const RAG_SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
] as const;

export type RagSupportedMimeType = typeof RAG_SUPPORTED_MIME_TYPES[number];

/** Check if a MIME type is supported for RAG processing. */
export function isRagSupported(mimeType: string): mimeType is RagSupportedMimeType {
  return (RAG_SUPPORTED_MIME_TYPES as readonly string[]).includes(mimeType);
}
