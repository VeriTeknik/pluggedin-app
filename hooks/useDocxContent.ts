import { useEffect,useState } from 'react';

import { isDocxFile } from '@/lib/file-utils';
import type { Doc } from '@/types/library';

export function useDocxContent(doc: Doc | null, open: boolean, projectUuid?: string) {
  const [docxContent, setDocxContent] = useState<string | null>(null);
  const [isLoadingDocx, setIsLoadingDocx] = useState(false);

  useEffect(() => {
    if (!doc || !open) {
      setDocxContent(null);
      return;
    }

    if (!isDocxFile(doc.mime_type, doc.name)) {
      setDocxContent(null);
      return;
    }

    setIsLoadingDocx(true);
    setDocxContent(null);

    const downloadUrl = `/api/library/download/${doc.uuid}${projectUuid ? `?projectUuid=${projectUuid}` : ''}`;
    fetch(downloadUrl)
      .then(res => {
        if (!res.ok) {
          throw new Error('Failed to fetch DOCX file');
        }
        return res.arrayBuffer();
      })
      .then(async arrayBuffer => {
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml({ arrayBuffer });
        
        const DOMPurify = (await import('dompurify')).default;
        const sanitized = DOMPurify.sanitize(result.value, { 
          ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody'],
          ALLOWED_ATTR: []
        });
        
        setDocxContent(sanitized);
        setIsLoadingDocx(false);
      })
      .catch(err => {
        console.error('Failed to fetch DOCX content:', err);
        setDocxContent(null);
        setIsLoadingDocx(false);
      });
  }, [doc, open, projectUuid]);

  return { docxContent, isLoadingDocx };
} 