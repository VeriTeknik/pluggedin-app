import { useEffect, useRef, useState } from 'react';

import { isDocxFile } from '@/lib/file-utils';
import type { Doc } from '@/types/library';

export function useDocxContent(doc: Doc | null, open: boolean, projectUuid?: string) {
  const [docxContent, setDocxContent] = useState<string | null>(null);
  const [isLoadingDocx, setIsLoadingDocx] = useState(false);
  const fetchControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!doc || !doc.uuid || !open) {
      fetchControllerRef.current?.abort();
      fetchControllerRef.current = null;
      setDocxContent(null);
      setIsLoadingDocx(false);
      return;
    }

    if (!isDocxFile(doc.mime_type, doc.name)) {
      fetchControllerRef.current?.abort();
      fetchControllerRef.current = null;
      setDocxContent(null);
      setIsLoadingDocx(false);
      return;
    }

    const controller = new AbortController();
    fetchControllerRef.current?.abort();
    fetchControllerRef.current = controller;

    setIsLoadingDocx(true);
    setDocxContent(null);

    let isActive = true;

    const downloadUrl = `/api/library/download/${doc.uuid}${projectUuid ? `?projectUuid=${projectUuid}` : ''}`;

    const loadDocx = async () => {
      try {
        const res = await fetch(downloadUrl, { signal: controller.signal });
        if (!res.ok) {
          throw new Error('Failed to fetch DOCX file');
        }

        const arrayBuffer = await res.arrayBuffer();
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml({ arrayBuffer });

        const DOMPurify = (await import('dompurify')).default;
        const sanitized = DOMPurify.sanitize(result.value, {
          ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody'],
          ALLOWED_ATTR: [],
        });

        if (!isActive || controller.signal.aborted) {
          return;
        }

        setDocxContent(sanitized);
      } catch (err) {
        if (controller.signal.aborted || !isActive) {
          return;
        }

        console.error('Failed to fetch DOCX content:', err);
        setDocxContent(null);
      } finally {
        if (!controller.signal.aborted && isActive) {
          setIsLoadingDocx(false);
        }
      }
    };

    void loadDocx();

    return () => {
      isActive = false;
      controller.abort();
      if (fetchControllerRef.current === controller) {
        fetchControllerRef.current = null;
      }
    };
  }, [doc?.uuid, doc?.mime_type, doc?.name, open, projectUuid]);

  return { docxContent, isLoadingDocx };
} 
