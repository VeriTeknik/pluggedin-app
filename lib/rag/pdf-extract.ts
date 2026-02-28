/**
 * Server-side PDF text extraction using unpdf.
 *
 * unpdf ships a serverless-optimized PDF.js build, avoiding
 * webpack bundling issues with pdfjs-dist in Next.js server actions.
 */

import { extractText, getDocumentProxy } from 'unpdf';

export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text as string;
}
