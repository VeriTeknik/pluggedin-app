'use client';

import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  GitBranch,
  Image as ImageIcon,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { lazy, memo, Suspense,useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { getDocumentVersionContent } from '@/app/actions/document-versions';
import { ModelAttributionBadge } from '@/components/library/ModelAttributionBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { useProjects } from '@/hooks/use-projects';
import { useDocxContent } from '@/hooks/useDocxContent';
import { getFileLanguage, isDocxFile, isImageFile, isMarkdownFile, isPDFFile, isTextFile, isTextFileByExtension, isValidTextMimeType, ZOOM_LIMITS } from '@/lib/file-utils';
import type { DocumentVersion } from '@/types/document-versioning';
import { Doc } from '@/types/library';

import { AIMetadataPanel } from './AIMetadataPanel';
import { DocumentVersionHistory } from './DocumentVersionHistory';
import { UploadMetadataPanel } from './UploadMetadataPanel';

// Lazy load heavy components
const ReactMarkdown = lazy(() => import('react-markdown'));
const PDFViewer = lazy(() => import('./PDFViewer'));

// Module-level cache for dynamic imports
const importCache: Record<string, any> = {};

const getDynamicImport = async (key: string, importFn: () => Promise<any>) => {
  if (!importCache[key]) {
    importCache[key] = await importFn();
  }
  return importCache[key];
};

// Consolidated state interface
interface DocumentPreviewState {
  ui: {
    isFullscreen: boolean;
    imageZoom: number;
    currentDocIndex: number;
    showVersionHistory: boolean;
    showMetadataPanel: boolean;
    viewingVersion: boolean;
    selectedVersionNumber: number | null;
  };
  content: {
    textContent: string | null;
    isLoadingText: boolean;
    textError: string | null;
  };
  versions: {
    list: DocumentVersion[];
    isLoading: boolean;
    error: string | null;
    selectedVersion: DocumentVersion | null;
    versionContent: string | null;
    isLoadingVersionContent: boolean;
  };
}

// Action types
type DocumentPreviewAction =
  | { type: 'SET_FULLSCREEN'; payload: boolean }
  | { type: 'SET_IMAGE_ZOOM'; payload: number }
  | { type: 'SET_CURRENT_DOC_INDEX'; payload: number }
  | { type: 'TOGGLE_VERSION_HISTORY' }
  | { type: 'TOGGLE_METADATA_PANEL' }
  | { type: 'SET_TEXT_CONTENT'; payload: { content: string | null; error?: string | null } }
  | { type: 'SET_TEXT_LOADING'; payload: boolean }
  | { type: 'SET_TEXT_ERROR'; payload: string | null }
  | { type: 'SET_VERSIONS'; payload: DocumentVersion[] }
  | { type: 'SET_VERSIONS_LOADING'; payload: boolean }
  | { type: 'SET_VERSIONS_ERROR'; payload: string | null }
  | { type: 'SET_SELECTED_VERSION'; payload: DocumentVersion | null }
  | { type: 'SET_VERSION_CONTENT'; payload: string | null }
  | { type: 'SET_VERSION_CONTENT_LOADING'; payload: boolean }
  | { type: 'RESET_DOCUMENT_STATE' }
  | { type: 'RESET_VERSION_STATE' }
  | { type: 'VIEW_VERSION'; payload: number }
  | { type: 'VIEW_CURRENT_DOCUMENT' };

// Reducer function
const documentPreviewReducer = (state: DocumentPreviewState, action: DocumentPreviewAction): DocumentPreviewState => {
  switch (action.type) {
    case 'SET_FULLSCREEN':
      return { ...state, ui: { ...state.ui, isFullscreen: action.payload } };
    case 'SET_IMAGE_ZOOM':
      return { ...state, ui: { ...state.ui, imageZoom: action.payload } };
    case 'SET_CURRENT_DOC_INDEX':
      return { ...state, ui: { ...state.ui, currentDocIndex: action.payload } };
    case 'TOGGLE_VERSION_HISTORY':
      return { ...state, ui: { ...state.ui, showVersionHistory: !state.ui.showVersionHistory } };
    case 'TOGGLE_METADATA_PANEL':
      return { ...state, ui: { ...state.ui, showMetadataPanel: !state.ui.showMetadataPanel } };
    case 'SET_TEXT_CONTENT':
      return {
        ...state,
        content: {
          ...state.content,
          textContent: action.payload.content,
          textError: action.payload.error || null,
          isLoadingText: false,
        },
      };
    case 'SET_TEXT_LOADING':
      return { ...state, content: { ...state.content, isLoadingText: action.payload } };
    case 'SET_TEXT_ERROR':
      return { ...state, content: { ...state.content, textError: action.payload } };
    case 'SET_VERSIONS':
      return {
        ...state,
        versions: { ...state.versions, list: action.payload, isLoading: false, error: null },
      };
    case 'SET_VERSIONS_LOADING':
      return { ...state, versions: { ...state.versions, isLoading: action.payload } };
    case 'SET_VERSIONS_ERROR':
      return { ...state, versions: { ...state.versions, error: action.payload, isLoading: false } };
    case 'SET_SELECTED_VERSION':
      return { ...state, versions: { ...state.versions, selectedVersion: action.payload } };
    case 'SET_VERSION_CONTENT':
      return {
        ...state,
        versions: { ...state.versions, versionContent: action.payload, isLoadingVersionContent: false },
      };
    case 'SET_VERSION_CONTENT_LOADING':
      return { ...state, versions: { ...state.versions, isLoadingVersionContent: action.payload } };
    case 'RESET_DOCUMENT_STATE':
      return {
        ...state,
        ui: { ...state.ui, imageZoom: 1, showVersionHistory: false, showMetadataPanel: false, viewingVersion: false, selectedVersionNumber: null },
        content: { textContent: null, isLoadingText: false, textError: null },
        versions: {
          list: [],
          isLoading: false,
          error: null,
          selectedVersion: null,
          versionContent: null,
          isLoadingVersionContent: false,
        },
      };
    case 'RESET_VERSION_STATE':
      return {
        ...state,
        versions: {
          list: [],
          isLoading: false,
          error: null,
          selectedVersion: null,
          versionContent: null,
          isLoadingVersionContent: false,
        },
      };
    case 'VIEW_VERSION':
      return {
        ...state,
        ui: { ...state.ui, viewingVersion: true, selectedVersionNumber: action.payload },
      };
    case 'VIEW_CURRENT_DOCUMENT':
      return {
        ...state,
        ui: { ...state.ui, viewingVersion: false, selectedVersionNumber: null },
        versions: { ...state.versions, versionContent: null },
      };
    default:
      return state;
  }
};

// Initial state
const initialState: DocumentPreviewState = {
  ui: {
    isFullscreen: false,
    imageZoom: 1,
    currentDocIndex: 0,
    showVersionHistory: false,
    showMetadataPanel: false,
    viewingVersion: false,
    selectedVersionNumber: null,
  },
  content: {
    textContent: null,
    isLoadingText: false,
    textError: null,
  },
  versions: {
    list: [],
    isLoading: false,
    error: null,
    selectedVersion: null,
    versionContent: null,
    isLoadingVersionContent: false,
  },
};

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

export const DocumentPreview = memo(function DocumentPreview({
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
  const { toast } = useToast();
  const { currentProject } = useProjects();

  // Use reducer for consolidated state management
  const [state, dispatch] = useReducer(documentPreviewReducer, initialState);

  // Use hook for DOCX content
  const { docxContent, isLoadingDocx } = useDocxContent(doc, open, currentProject?.uuid);

  // Memoized file type checks
  const fileTypeInfo = useMemo(() => {
    if (!doc) return null;
    return {
      isImage: isImageFile(doc.mime_type),
      isPDF: isPDFFile(doc.mime_type),
      isText: isTextFile(doc.mime_type, doc.file_name),
      isDocx: isDocxFile(doc.mime_type, doc.name),
      isMarkdown: isMarkdownFile(doc.file_name),
      language: getFileLanguage(doc.file_name),
    };
  }, [doc?.mime_type, doc?.file_name, doc?.name]);

  // Memoized current doc index calculation
  const currentDocIndex = useMemo(() => {
    if (!doc || docs.length === 0) return 0;
    const index = docs.findIndex(d => d.uuid === doc.uuid);
    return index !== -1 ? index : 0;
  }, [doc?.uuid, docs]);

  // Update state when index changes
  useEffect(() => {
    dispatch({ type: 'SET_CURRENT_DOC_INDEX', payload: currentDocIndex });
  }, [currentDocIndex]);

  // Reset state when document changes
  useEffect(() => {
    dispatch({ type: 'RESET_DOCUMENT_STATE' });
  }, [doc?.uuid]);

  // Fetch version history for AI-generated documents with caching
  useEffect(() => {
    if (!doc || !open || doc.source !== 'ai_generated' || !doc.version || doc.version <= 1) {
      dispatch({ type: 'RESET_VERSION_STATE' });
      return;
    }

    const abortController = new AbortController();
    let timeoutId: NodeJS.Timeout;

    const fetchVersions = async () => {
      dispatch({ type: 'SET_VERSIONS_LOADING', payload: true });

      try {
        // Set timeout for version fetching
        timeoutId = setTimeout(() => {
          abortController.abort();
        }, 10000); // 10 second timeout

        // Use cached import
        const { getDocumentVersions } = await getDynamicImport(
          'library-actions',
          () => import('@/app/actions/library')
        );

        if (abortController.signal.aborted) return;

        const response = await getDocumentVersions(
          doc.user_id,
          doc.uuid,
          currentProject?.uuid
        );

        if (abortController.signal.aborted) return;

        if (response.success && response.versions) {
          const mappedVersions: DocumentVersion[] = response.versions.map((v: any) => ({
            id: `v${v.versionNumber}`,
            version_number: v.versionNumber,
            content: '',
            created_by_model: v.createdByModel,
            created_at: v.createdAt,
            change_summary: v.changeSummary,
            content_diff: v.contentDiff,
          }));
          dispatch({ type: 'SET_VERSIONS', payload: mappedVersions });
        } else {
          dispatch({ type: 'SET_VERSIONS_ERROR', payload: response.error || 'Failed to load version history' });
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (!abortController.signal.aborted) {
          dispatch({ type: 'SET_VERSIONS_ERROR', payload: 'Unable to load version history. Please try again later.' });
        }
      } finally {
        clearTimeout(timeoutId);
      }
    };

    fetchVersions();

    return () => {
      abortController.abort();
      clearTimeout(timeoutId);
    };
  }, [doc?.uuid, doc?.source, doc?.version, doc?.user_id, open, currentProject?.uuid]);

  // Fetch text content with timeout and streaming support
  useEffect(() => {
    // Skip fetching text content when viewing a specific version
    if (!doc || !open || !fileTypeInfo?.isText || state.ui.viewingVersion) {
      dispatch({ type: 'SET_TEXT_CONTENT', payload: { content: null } });
      return;
    }

    const abortController = new AbortController();
    let timeoutId: NodeJS.Timeout;

    dispatch({ type: 'SET_TEXT_LOADING', payload: true });
    dispatch({ type: 'SET_TEXT_ERROR', payload: null });

    const downloadUrl = `/api/library/download/${doc.uuid}${currentProject?.uuid ? `?projectUuid=${currentProject.uuid}` : ''}`;

    const fetchTextContent = async () => {
      try {
        // Set timeout for large files
        timeoutId = setTimeout(() => {
          abortController.abort();
        }, 30000); // 30 second timeout

        const response = await fetch(downloadUrl, { signal: abortController.signal });

        if (!response.ok) {
          throw new Error(`Failed to load document (${response.status})`);
        }

        const contentType = response.headers.get('content-type');
        const isValidByExtension = doc?.name ? isTextFileByExtension(doc.name) : false;
        const isValidByContentType = isValidTextMimeType(contentType);

        if (!isValidByExtension && !isValidByContentType) {
          throw new Error('This file format cannot be displayed as text');
        }

        // Check file size before loading
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > 50 * 1024 * 1024) {
          throw new Error('File too large for preview (max 50MB)');
        }

        const text = await response.text();

        if (abortController.signal.aborted) return;

        // Use cached DOMPurify import
        const DOMPurify = (await getDynamicImport('dompurify', () => import('dompurify'))).default;

        const sanitized = DOMPurify.sanitize(text, {
          ALLOWED_TAGS: [],
          ALLOWED_ATTR: [],
          KEEP_CONTENT: true,
        });

        if (!abortController.signal.aborted) {
          dispatch({ type: 'SET_TEXT_CONTENT', payload: { content: sanitized } });
        }
      } catch (err) {
        if (err instanceof Error) {
          if (err.name === 'AbortError') return;
          if (!abortController.signal.aborted) {
            dispatch({ type: 'SET_TEXT_ERROR', payload: err.message || 'Unable to load document content. Please try again.' });
          }
        }
      } finally {
        clearTimeout(timeoutId);
      }
    };

    fetchTextContent();

    return () => {
      abortController.abort();
      clearTimeout(timeoutId);
    };
  }, [doc?.uuid, doc?.name, open, currentProject?.uuid, fileTypeInfo?.isText]);

  // Memoized navigation callbacks
  const navigateToDoc = useCallback((direction: 'prev' | 'next') => {
    if (docs.length <= 1 || !onDocChange) return;

    let newIndex;
    if (direction === 'prev') {
      newIndex = state.ui.currentDocIndex > 0 ? state.ui.currentDocIndex - 1 : docs.length - 1;
    } else {
      newIndex = state.ui.currentDocIndex < docs.length - 1 ? state.ui.currentDocIndex + 1 : 0;
    }

    onDocChange(docs[newIndex]);
  }, [state.ui.currentDocIndex, docs, onDocChange]);

  // Memoized zoom handlers
  const zoomHandlers = useMemo(() => ({
    handleZoomIn: () => dispatch({ type: 'SET_IMAGE_ZOOM', payload: Math.min(state.ui.imageZoom * ZOOM_LIMITS.STEP, ZOOM_LIMITS.MAX) }),
    handleZoomOut: () => dispatch({ type: 'SET_IMAGE_ZOOM', payload: Math.max(state.ui.imageZoom / ZOOM_LIMITS.STEP, ZOOM_LIMITS.MIN) }),
    resetZoom: () => dispatch({ type: 'SET_IMAGE_ZOOM', payload: 1 }),
  }), [state.ui.imageZoom]);

  // Track pending version request for cancellation
  const versionLoadingRef = useRef<{ abort: () => void } | null>(null);
  const versionDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleVersionSelect = useCallback(async (version: DocumentVersion) => {
    if (!doc?.uuid) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Document ID is not available. Please refresh the page and try again.',
      });
      return;
    }

    // Cancel any pending debounced request
    if (versionDebounceRef.current) {
      clearTimeout(versionDebounceRef.current);
    }

    // Cancel any in-flight request
    if (versionLoadingRef.current) {
      versionLoadingRef.current.abort();
    }

    // Debounce the version loading by 300ms to prevent rapid switches
    versionDebounceRef.current = setTimeout(async () => {
      // Load version content to display in main pane
      dispatch({ type: 'VIEW_VERSION', payload: version.version_number });
      dispatch({ type: 'SET_VERSION_CONTENT_LOADING', payload: true });

      // Create abort controller for this request
      const abortController = new AbortController();
      versionLoadingRef.current = abortController;

      try {
        // Use server action with session authentication
        const result = await getDocumentVersionContent(
          doc.uuid,
          version.version_number
        );

        // Check if request was aborted
        if (abortController.signal.aborted) return;

        if (!result.success) {
          throw new Error(result.error);
        }

        dispatch({ type: 'SET_VERSION_CONTENT', payload: result.content || '' });
      } catch (error) {
        // Don't handle errors for aborted requests
        if (abortController.signal.aborted) return;

        dispatch({ type: 'SET_VERSION_CONTENT', payload: null });
        toast({
          variant: 'destructive',
          title: 'Error loading version',
          description: error instanceof Error ? error.message : 'Failed to load version content',
        });
      } finally {
        // Clear ref if this was the current request
        if (versionLoadingRef.current === abortController) {
          versionLoadingRef.current = null;
        }
      }
    }, 300);
  }, [doc?.uuid, toast]);

  const handleCompareVersions = useCallback((v1: DocumentVersion, v2: DocumentVersion) => {
    // Version comparison functionality - to be implemented
    // This will open a diff viewer comparing the two versions
  }, []);

  // Render helpers remain the same but use state from reducer
  const renderContent = () => {
    if (!doc || !fileTypeInfo) return null;

    // If viewing a version, show version content
    if (state.ui.viewingVersion) {
      if (state.versions.isLoadingVersionContent) {
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Loading version {state.ui.selectedVersionNumber}...</p>
            </div>
          </div>
        );
      }

      if (!state.versions.versionContent) {
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">Version content not available</h3>
              <Button
                variant="outline"
                onClick={() => dispatch({ type: 'VIEW_CURRENT_DOCUMENT' })}
                className="mt-4"
              >
                Back to Current Version
              </Button>
            </div>
          </div>
        );
      }

      // Display version content as text
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b bg-muted/50">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Version {state.ui.selectedVersionNumber}</Badge>
              <span className="text-sm text-muted-foreground">Viewing historical version</span>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => dispatch({ type: 'VIEW_CURRENT_DOCUMENT' })}
            >
              Back to Current
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-6">
              {fileTypeInfo.isMarkdown ? (
                <Suspense fallback={<div>Loading...</div>}>
                  <div className="prose dark:prose-invert max-w-none">
                    <ReactMarkdown>
                      {state.versions.versionContent}
                    </ReactMarkdown>
                  </div>
                </Suspense>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-sm">
                  {state.versions.versionContent}
                </pre>
              )}
            </div>
          </ScrollArea>
        </div>
      );
    }

    // Image rendering
    if (fileTypeInfo.isImage) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
          <div
            className="relative overflow-auto max-w-full max-h-full"
            style={{ transform: `scale(${state.ui.imageZoom})`, transformOrigin: 'center' }}
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
              onClick={zoomHandlers.handleZoomOut}
              disabled={state.ui.imageZoom <= 0.1}
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={zoomHandlers.resetZoom}
              aria-label={`Reset zoom (currently ${Math.round(state.ui.imageZoom * 100)}%)`}
            >
              {Math.round(state.ui.imageZoom * 100)}%
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={zoomHandlers.handleZoomIn}
              disabled={state.ui.imageZoom >= 5}
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    }

    // PDF rendering
    if (fileTypeInfo.isPDF) {
      return (
        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }>
          <PDFViewer
            fileUrl={`/api/library/download/${doc.uuid}${currentProject?.uuid ? `?projectUuid=${currentProject.uuid}` : ''}`}
          />
        </Suspense>
      );
    }

    // DOCX rendering
    if (fileTypeInfo.isDocx) {
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

    // Text file rendering
    if (fileTypeInfo.isText) {
      if (state.content.isLoadingText) {
        return (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        );
      }

      if (state.content.textError) {
        return (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-destructive opacity-50" />
              <p className="text-destructive font-medium mb-2">{t('preview.errorLoadingContent', 'Error loading content')}</p>
              <p className="text-sm text-muted-foreground">{state.content.textError}</p>
            </div>
          </div>
        );
      }

      if (state.content.textContent) {
        if (fileTypeInfo.isMarkdown) {
          return (
            <div className="absolute inset-0 overflow-y-auto overflow-x-hidden">
              <div className="p-6">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <Suspense fallback={<div>Loading...</div>}>
                    <ReactMarkdown>{state.content.textContent}</ReactMarkdown>
                  </Suspense>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="absolute inset-0 overflow-y-auto overflow-x-hidden">
            <div className="p-6">
              <pre className="text-sm overflow-x-auto">
                <code className={`language-${fileTypeInfo.language}`}>
                  {state.content.textContent}
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

  const getFileIcon = (mimeType: string) => {
    if (isImageFile(mimeType)) {
      return <ImageIcon className="h-5 w-5 text-muted-foreground" />;
    }
    return <FileText className="h-5 w-5 text-muted-foreground" />;
  };

  if (!doc) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${state.ui.isFullscreen ? 'w-screen h-screen max-w-none max-h-none rounded-none' : 'max-w-6xl w-[90vw] h-[90vh] rounded-lg'} p-0 gap-0 overflow-hidden`}
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
                    {state.ui.currentDocIndex + 1} / {docs.length}
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

              {/* AI Metadata Button */}
              {((doc.source === 'ai_generated' && doc.ai_metadata) ||
                (doc.source === 'upload' && doc.upload_metadata)) && (
                <>
                  <Button
                    variant={state.ui.showMetadataPanel ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => dispatch({ type: 'TOGGLE_METADATA_PANEL' })}
                    aria-label={state.ui.showMetadataPanel ? "Hide metadata" : "Show metadata"}
                    aria-expanded={state.ui.showMetadataPanel}
                  >
                    <Info className="h-4 w-4" />
                    <span className="ml-2 text-xs">
                      {doc.source === 'ai_generated' ? 'AI Info' : 'Upload Info'}
                    </span>
                  </Button>
                  <Separator orientation="vertical" className="h-6" />
                </>
              )}

              {/* Version History Button */}
              {doc.source === 'ai_generated' && doc.version > 1 && (
                <>
                  <Button
                    variant={state.ui.showVersionHistory ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => dispatch({ type: 'TOGGLE_VERSION_HISTORY' })}
                    disabled={state.versions.isLoading}
                    aria-label={state.ui.showVersionHistory ? "Hide version history" : "Show version history"}
                    aria-expanded={state.ui.showVersionHistory}
                  >
                    {state.versions.isLoading ? (
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
                onClick={() => dispatch({ type: 'SET_FULLSCREEN', payload: !state.ui.isFullscreen })}
                aria-label={state.ui.isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {state.ui.isFullscreen ? (
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
                {renderContent()}
              </ErrorBoundary>
            </div>

            {/* Metadata Panel (AI or Upload) */}
            {state.ui.showMetadataPanel && (
              <div className="w-96 border-l bg-muted/10 overflow-hidden flex flex-col flex-shrink-0">
                <ScrollArea className="flex-1">
                  <div className="p-4">
                    {doc.source === 'ai_generated' && doc.ai_metadata ? (
                      <AIMetadataPanel
                        metadata={doc.ai_metadata}
                        documentName={doc.name}
                        source={doc.source}
                        version={doc.version}
                      />
                    ) : doc.source === 'upload' && doc.upload_metadata ? (
                      <UploadMetadataPanel doc={doc} />
                    ) : null}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Version History Panel */}
            {state.ui.showVersionHistory && doc.source === 'ai_generated' && (
              <div className="w-80 border-l bg-muted/10 flex flex-col flex-shrink-0">
                <div className="p-4 border-b bg-background">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Version History
                    </h3>
                    {doc.version && (
                      <Badge variant="outline" className="text-xs">
                        {doc.version} versions
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="p-4">
                      {state.versions.isLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <DocumentVersionHistory
                          documentId={doc.uuid}
                          versions={state.versions.list}
                          currentVersion={doc.version || 1}
                          onVersionSelect={handleVersionSelect}
                          onCompareVersions={handleCompareVersions}
                        />
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Removed Version Viewer Modal - content now displays in main pane */}
    </Dialog>
  );
});