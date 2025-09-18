'use client';

import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  GitBranch,
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
import { useProjects } from '@/hooks/use-projects';
import { useDocxContent } from '@/hooks/useDocxContent';
import { getFileLanguage, isDocxFile, isImageFile, isMarkdownFile, isPDFFile, isTextFile, isTextFileByExtension, isValidTextMimeType, ZOOM_LIMITS } from '@/lib/file-utils';
import { Doc } from '@/types/library';
import type { DocumentVersion } from '@/types/document-versioning';

import { DocumentVersionHistory } from './DocumentVersionHistory';

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
  const { currentProject } = useProjects();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState(false);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersion | null>(null);
  const [versionContent, setVersionContent] = useState<string | null>(null);
  const [isLoadingVersionContent, setIsLoadingVersionContent] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);

  // Use hook for DOCX content
  const { docxContent, isLoadingDocx } = useDocxContent(doc, open, currentProject?.uuid);

  // Update current doc index when doc changes
  useEffect(() => {
    if (doc && docs.length > 0) {
      const index = docs.findIndex(d => d.uuid === doc.uuid);
      if (index !== -1) {
        setCurrentDocIndex(index);
      }
    }
  }, [doc, docs]);

  // Reset zoom and version state when document changes
  useEffect(() => {
    setImageZoom(1);
    setShowVersionHistory(false);
    setVersions([]);
    setSelectedVersion(null);
    setVersionContent(null);
    setVersionError(null);
    setTextError(null);
  }, [doc?.uuid]);

  // Fetch version history for AI-generated documents
  useEffect(() => {
    if (!doc || !open || doc.source !== 'ai_generated') {
      setVersions([]);
      return;
    }

    // Don't fetch versions if we already have them or if not needed
    if (!doc.version || doc.version <= 1) {
      setVersions([]);
      return;
    }

    const abortController = new AbortController();

    const fetchVersions = async () => {
      setIsLoadingVersions(true);
      setVersionError(null);
      try {
        const { getDocumentVersions } = await import('@/app/actions/library');
        const { useSafeSession } = await import('@/hooks/use-safe-session');

        // Check if aborted
        if (abortController.signal.aborted) return;

        // Get session to fetch versions
        const response = await getDocumentVersions(
          doc.user_id,
          doc.uuid,
          currentProject?.uuid
        );

        // Check if aborted before setting state
        if (abortController.signal.aborted) return;

        if (response.success && response.versions) {
          // Map the response to match DocumentVersion interface
          const mappedVersions: DocumentVersion[] = response.versions.map((v: any) => ({
            id: `v${v.versionNumber}`, // Generate a temporary ID
            version_number: v.versionNumber,
            content: '', // Content is loaded separately
            created_by_model: v.createdByModel,
            created_at: v.createdAt,
            change_summary: v.changeSummary,
            content_diff: v.contentDiff
          }));
          setVersions(mappedVersions);
        } else {
          setVersions([]);
          setVersionError(response.error || 'Failed to load version history');
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Failed to fetch version history:', error);
        setVersions([]);
        if (!abortController.signal.aborted) {
          setVersionError('Unable to load version history. Please try again later.');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoadingVersions(false);
        }
      }
    };

    fetchVersions();

    return () => {
      abortController.abort();
    };
  }, [doc, open, currentProject?.uuid]);

  // Fetch text content for text files
  useEffect(() => {
    if (!doc || !open) {
      setTextContent(null);
      setTextError(null);
      return;
    }

    if (!isTextFile(doc.mime_type, doc.file_name)) {
      return;
    }

    const abortController = new AbortController();
    setIsLoadingText(true);
    setTextError(null);

    const downloadUrl = `/api/library/download/${doc.uuid}${currentProject?.uuid ? `?projectUuid=${currentProject.uuid}` : ''}`;

    fetch(downloadUrl, { signal: abortController.signal })
      .then(res => {
        // Check for HTTP errors
        if (!res.ok) {
          throw new Error(`Failed to load document (${res.status})`);
        }

        // Validate content type before processing
        const contentType = res.headers.get('content-type');

        // Allow all text files - prioritize extension over MIME type
        const isValidByExtension = doc?.name ? isTextFileByExtension(doc.name) : false;
        const isValidByContentType = isValidTextMimeType(contentType);

        // If file has text extension, allow it regardless of MIME type
        if (!isValidByExtension && !isValidByContentType) {
          throw new Error('This file format cannot be displayed as text');
        }
        return res.text();
      })
      .then(async text => {
        if (abortController.signal.aborted) return;

        // Use DOMPurify for robust HTML sanitization
        // Since we're dealing with text/code files, we want to strip ALL HTML
        const DOMPurify = (await import('dompurify')).default;

        // For text files, we don't want any HTML at all - just plain text
        const sanitized = DOMPurify.sanitize(text, {
          ALLOWED_TAGS: [],  // No HTML tags allowed
          ALLOWED_ATTR: [],  // No attributes allowed
          KEEP_CONTENT: true // Keep text content
        });

        if (!abortController.signal.aborted) {
          setTextContent(sanitized);
          setTextError(null);
          setIsLoadingText(false);
        }
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        console.error('Failed to fetch text content:', err);
        setTextContent(null);
        if (!abortController.signal.aborted) {
          setTextError(err.message || 'Unable to load document content. Please try again.');
        }
        setIsLoadingText(false);
      });

    return () => {
      abortController.abort();
    };
  }, [doc, open, currentProject?.uuid]);

  // DOCX content now handled by useDocxContent hook

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

  const handleVersionSelect = useCallback((version: DocumentVersion) => {
    setSelectedVersion(version);
    setIsLoadingVersionContent(true);

    // Here we would fetch the version content
    // For now, we'll just show the version's content if available
    if (version.content) {
      setVersionContent(version.content);
    } else {
      // In a real implementation, you'd fetch the version content from the API
      setVersionContent(`Version ${version.version_number} content would be displayed here.`);
    }
    setIsLoadingVersionContent(false);
  }, []);

  const handleCompareVersions = useCallback((v1: DocumentVersion, v2: DocumentVersion) => {
    // This would open a comparison view
    console.log('Comparing versions:', v1, v2);
    // You could implement a diff view here
  }, []);

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
                      fileUrl={`/api/library/download/${doc.uuid}${currentProject?.uuid ? `?projectUuid=${currentProject.uuid}` : ''}`}
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
              src={`/api/library/download/${doc.uuid}${currentProject?.uuid ? `?projectUuid=${currentProject.uuid}` : ''}`}
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
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={resetZoom}
              aria-label={`Reset zoom (currently ${Math.round(imageZoom * 100)}%)`}
            >
              {Math.round(imageZoom * 100)}%
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleZoomIn}
              disabled={imageZoom >= 5}
              aria-label="Zoom in"
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

      // Show error state if there was an error loading text
      if (textError) {
        return (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-destructive opacity-50" />
              <p className="text-destructive font-medium mb-2">{t('preview.errorLoadingContent', 'Error loading content')}</p>
              <p className="text-sm text-muted-foreground">{textError}</p>
            </div>
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
        className={`${isFullscreen ? 'w-screen h-screen max-w-none max-h-none rounded-none' : 'max-w-7xl w-[95vw] h-[90vh] rounded-lg'} p-0 gap-0 overflow-hidden`}
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
                    aria-label="Previous document"
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
                    aria-label="Next document"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Separator orientation="vertical" className="h-6 mx-2" />
                </>
              )}

              {/* Version History Button - Only for AI-generated documents */}
              {doc.source === 'ai_generated' && doc.version > 1 && (
                <>
                  <Button
                    variant={showVersionHistory ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setShowVersionHistory(!showVersionHistory)}
                    disabled={isLoadingVersions}
                    aria-label={showVersionHistory ? "Hide version history" : "Show version history"}
                    aria-expanded={showVersionHistory}
                  >
                    {isLoadingVersions ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <GitBranch className="h-4 w-4" />
                    )}
                    <span className="ml-2 text-xs">v{doc.version}</span>
                  </Button>
                  <Separator orientation="vertical" className="h-6" />
                </>
              )}

              {/* Actions */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFullscreen(!isFullscreen)}
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
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
                aria-label="Download document"
              >
                <Download className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(doc)}
                aria-label="Delete document"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex flex-1 min-h-0 overflow-hidden relative">
            {/* Main content area */}
            <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden relative min-w-0">
              <ErrorBoundary>
                {renderDocumentContent()}
              </ErrorBoundary>
            </div>

            {/* Version History Panel */}
            {showVersionHistory && doc.source === 'ai_generated' && (
              <div className="flex flex-col w-96 border-l bg-muted/30 flex-shrink-0">
                <div className="flex-1 min-h-0">
                  <ScrollArea className="h-full p-4">
                    {isLoadingVersions ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <DocumentVersionHistory
                        documentId={doc.uuid}
                        versions={versions}
                        currentVersion={doc.version || 1}
                        onVersionSelect={handleVersionSelect}
                        onCompareVersions={handleCompareVersions}
                      />
                    )}
                  </ScrollArea>
                </div>

                {/* Display selected version content */}
                {selectedVersion && (
                  <div className="h-1/3 border-t bg-card flex flex-col">
                    <div className="flex items-center justify-between p-3 border-b">
                      <h4 className="text-sm font-medium">
                        Version {selectedVersion.version_number} Content
                      </h4>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                        onClick={() => {
                          setSelectedVersion(null);
                          setVersionContent(null);
                        }}
                      >
                        ✕
                      </Button>
                    </div>
                    <div className="flex-1 min-h-0 p-3">
                      {isLoadingVersionContent ? (
                        <div className="flex items-center justify-center h-full">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      ) : (
                        <ScrollArea className="h-full">
                          <pre className="text-xs whitespace-pre-wrap font-mono">
                            {versionContent || 'Version content would be displayed here'}
                          </pre>
                        </ScrollArea>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sidebar with metadata */}
            {!isFullscreen && !showVersionHistory && (
              <div className="w-80 border-l bg-muted/30 flex-shrink-0">
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
                        <div className="space-y-3">
                          <div>
                            <span className="text-muted-foreground font-medium">{t('preview.aiMetadata', 'AI Metadata')}:</span>
                            <div className="mt-1 space-y-1">
                              {doc.ai_metadata.model && (
                                <p className="text-xs">
                                  <span className="text-muted-foreground">Model: </span>
                                  {doc.ai_metadata.model.provider} {doc.ai_metadata.model.name}
                                  {doc.ai_metadata.model.version && ` v${doc.ai_metadata.model.version}`}
                                </p>
                              )}
                              {doc.ai_metadata.context && (
                                <p className="text-xs">
                                  <span className="text-muted-foreground">Context: </span>
                                  {doc.ai_metadata.context}
                                </p>
                              )}
                            </div>
                          </div>

                          {doc.ai_metadata.prompt && (
                            <div>
                              <span className="text-muted-foreground font-medium">{t('preview.prompt', 'Prompt')}:</span>
                              <p className="text-xs mt-1 p-2 bg-muted/50 rounded-md whitespace-pre-wrap">
                                {doc.ai_metadata.prompt}
                              </p>
                            </div>
                          )}

                          {doc.ai_metadata.conversationContext && doc.ai_metadata.conversationContext.length > 0 && (
                            <div>
                              <span className="text-muted-foreground font-medium">{t('preview.conversationContext', 'Conversation Context')}:</span>
                              <div className="mt-1 space-y-1">
                                {doc.ai_metadata.conversationContext.map((msg: string, idx: number) => (
                                  <p key={idx} className="text-xs p-2 bg-muted/30 rounded-md">
                                    {msg}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}

                          {doc.ai_metadata.sourceDocuments && doc.ai_metadata.sourceDocuments.length > 0 && (
                            <div>
                              <span className="text-muted-foreground font-medium">{t('preview.sourceDocuments', 'Source Documents')}:</span>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {doc.ai_metadata.sourceDocuments.map((docId: string, idx: number) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    {docId.substring(0, 8)}...
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {doc.ai_metadata.generationParams && (
                            <div>
                              <span className="text-muted-foreground font-medium">{t('preview.generationParams', 'Generation Parameters')}:</span>
                              <div className="mt-1 text-xs space-y-1">
                                {doc.ai_metadata.generationParams.temperature !== undefined && (
                                  <p><span className="text-muted-foreground">Temperature:</span> {doc.ai_metadata.generationParams.temperature}</p>
                                )}
                                {doc.ai_metadata.generationParams.maxTokens !== undefined && (
                                  <p><span className="text-muted-foreground">Max Tokens:</span> {doc.ai_metadata.generationParams.maxTokens}</p>
                                )}
                                {doc.ai_metadata.generationParams.topP !== undefined && (
                                  <p><span className="text-muted-foreground">Top P:</span> {doc.ai_metadata.generationParams.topP}</p>
                                )}
                              </div>
                            </div>
                          )}
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