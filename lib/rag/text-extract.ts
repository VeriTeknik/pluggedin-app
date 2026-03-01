/**
 * Shared text extraction helper for RAG document processing.
 * Centralizes the logic for reading files from disk and extracting text content.
 */

import { readFile, stat } from 'fs/promises';

/** Maximum file size for text extraction (50 MB) */
const MAX_EXTRACT_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * Extract text content from a file on disk based on its MIME type.
 * Handles PDF extraction via unpdf and plain text via UTF-8 decoding.
 * Rejects files larger than 50 MB to prevent excessive memory allocation.
 */
export async function extractTextFromFile(
  filePath: string,
  mimeType: string,
): Promise<string> {
  // Guard against loading excessively large files into memory
  const fileInfo = await stat(filePath);
  if (fileInfo.size > MAX_EXTRACT_SIZE_BYTES) {
    throw new Error(
      `File too large for text extraction (${(fileInfo.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_EXTRACT_SIZE_BYTES / 1024 / 1024} MB.`
    );
  }

  if (mimeType === 'application/pdf') {
    const { extractTextFromPdf } = await import('@/lib/rag/pdf-extract');
    const buffer = await readFile(filePath);
    // Slice the underlying ArrayBuffer to the buffer's actual region.
    // Node.js Buffers can be views over a larger shared ArrayBuffer,
    // so buffer.buffer may contain data outside [byteOffset, byteOffset+byteLength).
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    return extractTextFromPdf(arrayBuffer);
  }

  // Plain text / markdown
  return readFile(filePath, 'utf-8');
}
