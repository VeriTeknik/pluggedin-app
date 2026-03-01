/**
 * Shared text extraction helper for RAG document processing.
 * Centralizes the logic for reading files from disk and extracting text content.
 */

import { readFile } from 'fs/promises';

/**
 * Extract text content from a file on disk based on its MIME type.
 * Handles PDF extraction via unpdf and plain text via UTF-8 decoding.
 */
export async function extractTextFromFile(
  filePath: string,
  mimeType: string,
): Promise<string> {
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
