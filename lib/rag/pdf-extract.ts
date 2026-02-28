/**
 * Server-side PDF text extraction using pdf-parse.
 *
 * Designed for Node.js server-side usage (no web workers needed).
 */

import { PDFParse } from 'pdf-parse';

export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  return result.text;
}
