'use client';

import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Minimize2,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect,useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelAttributionBadge } from '@/components/library/ModelAttributionBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { getFileLanguage, isDocxFile, isImageFile, isMarkdownFile, isPDFFile, isTextFile, isTextFileByExtension, isValidTextMimeType, ZOOM_LIMITS } from '@/lib/file-utils';
import { Doc } from '@/types/library';

// Dynamic imports for heavy components
const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const PDFViewer = dynamic(() => import('./PDFViewer'), { ssr: false });

interface DocumentPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: Doc | null;
  docs: Doc[];
  onDocChange?: (doc: Doc) => void;
  onDownload: (doc: Doc) => void;
  onDelete: (doc: Doc) => void;
  formatFileSize: (bytes: number) => string;
}

export function DocumentPreview({
  open,
  onOpenChange,
  doc,
  docs,
  onDocChange,
  onDownload,
  onDelete,
  formatFileSize,
}: DocumentPreviewProps) {
  const { t } = useTranslation('library');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState(false);
  const [docxContent, setDocxContent] = useState<string | null>(null);
  const [isLoadingDocx, setIsLoadingDocx] = useState(false);

  // Update current doc index when doc changes
  useEffect(() => {
    if (doc && docs.length > 0) {
      const index = docs.findIndex(d => d.uuid === doc.uuid);
      if (index !== -1) {
        setCurrentDocIndex(index);
      }
    }
  }, [doc, docs]);

  // Reset zoom when document changes
  useEffect(() => {
    setImageZoom(1);
  }, [doc?.uuid]);

  // Fetch text content for text files
  useEffect(() => {
    if (!doc || !open) {
      setTextContent(null);
      return;
    }

    if (isTextFile(doc.mime_type, doc.file_name)) {
      setIsLoadingText(true);
      fetch(`/api/library/download/${doc.uuid}`)
        .then(res => {
          // Validate content type before processing
          const contentType = res.headers.get('content-type');
          
          // Allow all text files - prioritize extension over MIME type
          const isValidByExtension = doc?.name ? isTextFileByExtension(doc.name) : false;
          const isValidByContentType = isValidTextMimeType(contentType);
          
          // If file has text extension, allow it regardless of MIME type
          if (!isValidByExtension && !isValidByContentType) {
            throw new Error('Invalid content type for text processing');
          }
          return res.text();
        })
        .then(async text => {
          // Use DOMPurify for robust HTML sanitization
          // Since we're dealing with text/code files, we want to strip ALL HTML
          const DOMPurify = (await import('dompurify')).default;
          
          // For text files, we don't want any HTML at all - just plain text
          const sanitized = DOMPurify.sanitize(text, { 
            ALLOWED_TAGS: [],  // No HTML tags allowed
            ALLOWED_ATTR: [],  // No attributes allowed
            KEEP_CONTENT: true // Keep text content
          });
          
          setTextContent(sanitized);
          setIsLoadingText(false);
        })
        .catch(err => {
          console.error('Failed to fetch text content:', err);
          setTextContent(null);
          setIsLoadingText(false);
        });
    }
  }, [doc, open]);

  // Fetch DOCX content for DOCX files
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

    fetch(`/api/documents/files/${doc.uuid}`)
      .then(res => {
        if (!res.ok) {
          throw new Error('Failed to fetch DOCX file');
        }
        return res.arrayBuffer();
      })
      .then(async arrayBuffer => {
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml({ arrayBuffer });
        
        // Use DOMPurify for HTML sanitization
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
  }, [doc, open]);

  const navigateToDoc = useCallback((direction: 'prev' | 'next') => {
    if (docs.length <= 1 || !onDocChange) return;
    
    let newIndex;
    if (direction === 'prev') {
      newIndex = currentDocIndex > 0 ? currentDocIndex - 1 : docs.length - 1;
    } else {
      newIndex = currentDocIndex < docs.length - 1 ? currentDocIndex + 1 : 0;
    }
    
    setCurrentDocIndex(newIndex);
    onDocChange(docs[newIndex]);
  }, [currentDocIndex, docs, onDocChange]);

  const handleZoomIn = () => setImageZoom(prev => Math.min(prev * ZOOM_LIMITS.STEP, ZOOM_LIMITS.MAX));
  const handleZoomOut = () => setImageZoom(prev => Math.max(prev / ZOOM_LIMITS.STEP, ZOOM_LIMITS.MIN));
  const resetZoom = () => setImageZoom(1);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          navigateToDoc('prev');
          break;
        case 'ArrowRight':
          e.preventDefault();
          navigateToDoc('next');
          break;
        case 'Escape':
          e.preventDefault();
          onOpenChange(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, navigateToDoc, onOpenChange]);

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return <FileText className="h-5 w-5" />;
    if (mimeType.includes('image')) return <ImageIcon className="h-5 w-5" />;
    return <FileText className="h-5 w-5" />;
  };

  const isImage = doc ? isImageFile(doc.mime_type) : false;
  const isPDF = doc ? isPDFFile(doc.mime_type) : false;
  const isText = doc ? isTextFile(doc.mime_type, doc.file_name) : false;

  const renderDocumentContent = () => {
    if (!doc) return null;

    if (isPDF) {
      return (
        <PDFViewer
          fileUrl={`/api/library/download/${doc.uuid}`}
          className="w-full h-full"
        />
      );
    }

    if (isImage) {
      return (
        <div className="flex-1 flex items-center justify-center overflow-hidden bg-muted/50">
          <div 
            className="relative transition-transform duration-200"
            style={{ transform: `scale(${imageZoom})` }}
          >
            <img
              src={`/api/library/download/${doc.uuid}`}
              alt={doc.name}
              className="max-w-full max-h-full object-contain"
              draggable={false}
            />
          </div>
          
          {/* Zoom controls */}
          <div className="absolute bottom-4 right-4 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleZoomOut}
              disabled={imageZoom <= 0.1}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={resetZoom}
            >
              {Math.round(imageZoom * 100)}%
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleZoomIn}
              disabled={imageZoom >= 5}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    }

    // DOCX files
    if (isDocxFile(doc.mime_type, doc.name)) {
      if (isLoadingDocx) {
        return (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        );
      }

      if (docxContent) {
        return (
          <div className="absolute inset-0 overflow-y-auto overflow-x-hidden">
            <div className="p-6">
              <div 
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: docxContent }}
              />
            </div>
          </div>
        );
      }

      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Failed to load DOCX content</p>
            <Button onClick={() => doc && onDownload(doc)} className="mt-4">
              <Download className="mr-2 h-4 w-4" />
              {t('preview.download')}
            </Button>
          </div>
        </div>
      );
    }

    if (isText) {
      if (isLoadingText) {
        return (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        );
      }

      if (textContent) {
        const language = getFileLanguage(doc.file_name);

        if (isMarkdownFile(doc.file_name)) {
          return (
            <div className="absolute inset-0 overflow-y-auto overflow-x-hidden">
              <div className="p-6">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{textContent}</ReactMarkdown>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="absolute inset-0 overflow-y-auto overflow-x-hidden">
            <div className="p-6">
              <pre className="text-sm overflow-x-auto">
                <code className={`language-${language}`}>
                  {textContent}
                </code>
              </pre>
            </div>
          </div>
        );
      }

      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('preview.textContentNote')}</p>
          </div>
        </div>
      );
    }

    // Fallback for unsupported file types
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">{t('preview.unsupportedType')}</h3>
          <p className="text-sm mb-4">{t('preview.downloadToView')}</p>
          <Button onClick={() => doc && onDownload(doc)}>
            <Download className="mr-2 h-4 w-4" />
            {t('preview.download')}
          </Button>
        </div>
      </div>
    );
  };

  if (!doc) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={`${isFullscreen ? 'w-screen h-screen max-w-none max-h-none rounded-none' : 'max-w-7xl h-[90vh] rounded-lg'} p-0 gap-0 overflow-hidden`}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <VisuallyHidden>
          <DialogTitle>{doc?.name ? `${t('preview.documentTitle', 'Document')} - ${doc.name}` : t('preview.documentTitle', 'Document')}</DialogTitle>
          <DialogDescription>
            {doc ? `${t('preview.documentDescription', 'Preview of document')} ${doc.name} (${formatFileSize(doc.file_size)})` : t('preview.documentDescription', 'Preview of document')}
          </DialogDescription>
        </VisuallyHidden>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 pr-12 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 rounded-t-lg">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {getFileIcon(doc.mime_type)}
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold truncate">{doc.name}</h2>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{formatFileSize(doc.file_size)}</span>
                  <span>•</span>
                  <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                  {doc.source === 'ai_generated' && doc.ai_metadata?.model && (
                    <>
                      <span>•</span>
                      <ModelAttributionBadge
                        modelName={doc.ai_metadata.model.name}
                        modelProvider={doc.ai_metadata.model.provider}
                        modelVersion={doc.ai_metadata.model.version}
                        timestamp={doc.ai_metadata.timestamp}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Navigation and Controls */}
            <div className="flex items-center gap-2">
              {/* Document navigation */}
              {docs.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigateToDoc('prev')}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground px-2">
                    {currentDocIndex + 1} / {docs.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigateToDoc('next')}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Separator orientation="vertical" className="h-6 mx-2" />
                </>
              )}

              {/* Actions */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDownload(doc)}
              >
                <Download className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(doc)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Main content area */}
            <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden relative">
              <ErrorBoundary>
                {renderDocumentContent()}
              </ErrorBoundary>
            </div>

            {/* Sidebar with metadata */}
            {!isFullscreen && (
              <div className="w-80 border-l bg-muted/30">
                <ScrollArea className="h-full p-4">
                  <div className="space-y-4">
                  <div>
                    <h3 className="font-medium mb-2">{t('preview.metadata')}</h3>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">{t('preview.fileName')}:</span>
                        <p className="font-mono text-xs mt-1 break-all">{doc.file_name}</p>
                      </div>
                      
                      <div>
                        <span className="text-muted-foreground">{t('preview.fileType')}:</span>
                        <p className="mt-1">{doc.mime_type}</p>
                      </div>

                      <div>
                        <span className="text-muted-foreground">{t('preview.size')}:</span>
                        <p className="mt-1">{formatFileSize(doc.file_size)}</p>
                      </div>

                      <div>
                        <span className="text-muted-foreground">{t('preview.created')}:</span>
                        <p className="mt-1">{new Date(doc.created_at).toLocaleString()}</p>
                      </div>

                      {doc.description && (
                        <div>
                          <span className="text-muted-foreground">{t('preview.description')}:</span>
                          <p className="mt-1">{doc.description}</p>
                        </div>
                      )}

                      {doc.tags && doc.tags.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">{t('preview.tags')}:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {doc.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {doc.source === 'ai_generated' && doc.ai_metadata && (
                        <div>
                          <span className="text-muted-foreground">{t('preview.aiMetadata')}:</span>
                          <div className="mt-1 space-y-1">
                            {doc.ai_metadata.model && (
                              <p className="text-xs">
                                {doc.ai_metadata.model.provider} {doc.ai_metadata.model.name}
                                {doc.ai_metadata.model.version && ` v${doc.ai_metadata.model.version}`}
                              </p>
                            )}
                            {doc.ai_metadata.context && (
                              <p className="text-xs text-muted-foreground">{doc.ai_metadata.context}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}