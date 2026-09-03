/**
 * DOCX conversion must survive the `@xmldom/xmldom` override.
 *
 * `hooks/useDocxContent.ts` renders .docx previews through mammoth, and mammoth
 * 1.12.0 calls `DOMParser.parseFromString(string)` with no MIME type. xmldom
 * made that argument mandatory in 0.9.0, so any override that lifts mammoth
 * onto the 0.9 line turns every DOCX preview into
 *
 *   TypeError: DOMParser.parseFromString: the provided mimeType "undefined" is not valid.
 *
 * An unbounded `'@xmldom/xmldom@<0.8.13': '>=0.8.13'` override did exactly that
 * — it was written to clear an advisory on the 0.8 line and, having no ceiling,
 * drifted to 0.9.10 as soon as that was published. Nothing failed loudly; the
 * preview simply stopped working. This test converts a real DOCX so the next
 * bump to that override has to keep it working.
 */
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

// jszip is not a direct dependency of this app; mammoth ships it, and resolving
// it through mammoth is also the honest thing to do — this test should exercise
// whatever mammoth itself would use.
// `paths` takes directories, so resolve from mammoth's own directory rather
// than from its entry file.
const mammothDir = dirname(require.resolve('mammoth'));
const JSZip = require(require.resolve('jszip', { paths: [mammothDir] }));

async function buildDocx(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>'
  );
  zip.folder('_rels')!.file(
    '.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>'
  );
  zip.folder('word')!.file(
    'document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('DOCX preview conversion', () => {
  it('converts a DOCX to HTML with the resolved xmldom', async () => {
    const buffer = await buildDocx('Plugged.in DOCX preview');
    const mammoth = await import('mammoth');

    const result = await mammoth.convertToHtml({ buffer });

    expect(result.value).toContain('Plugged.in DOCX preview');
  });

  it('resolves mammoth onto an xmldom whose parseFromString accepts one argument', async () => {
    // The narrower assertion: mammoth's exact call shape. Kept separate so a
    // failure says which half broke — the wiring or the parser contract.
    const xmldomPath = require.resolve('@xmldom/xmldom', { paths: [mammothDir] });
    const { DOMParser } = require(xmldomPath);

    const parsed = new DOMParser().parseFromString('<w:t xmlns:w="urn:x">HI</w:t>');

    expect(parsed.documentElement.textContent).toBe('HI');
  });
});
