/**
 * Server-side PDF text extraction using pdfjs-dist.
 *
 * Uses the pdfjs-dist library (transitive dep from react-pdf)
 * to extract text content from PDF buffers without a browser.
 */

export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjsLib = require('pdfjs-dist/build/pdf.mjs');

  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .filter((item: Record<string, unknown>) => 'str' in item)
      .map((item: Record<string, unknown>) => item.str as string)
      .join(' ');
    pages.push(text);
  }

  return pages.join('\n\n');
}
