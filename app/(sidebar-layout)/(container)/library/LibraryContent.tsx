'use client';

// React / Next imports
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { Download, Eye, Loader2, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Internal components
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageContainer } from '@/components/ui/page-container';
import { Tabs, TabsContent } from '@/components/ui/tabs';
// Internal hooks and types
import { useKnowledgeBaseSearch } from '@/hooks/use-knowledge-base-search';
import { useLibrary } from '@/hooks/use-library';
import type { Doc } from '@/types/library';

import { AiSearchAnswer } from './components/AiSearchAnswer';
import { DocsControls } from './components/DocsControls';
import { DocsGrid } from './components/DocsGrid';
import { DocsStats } from './components/DocsStats';
import { DocsTable } from './components/DocsTable';
// Local components
import { DocumentPreview } from './components/DocumentPreview';
import { UploadDialog } from './components/UploadDialog';
import { UploadProgress } from './components/UploadProgress';

const columnHelper = createColumnHelper<Doc>();

export default function LibraryContent() {
  const { t } = useTranslation('library');
  const { docs, isLoading, storageUsage, uploadDoc, removeDoc, downloadDoc } = useLibrary();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'upload' | 'ai_generated' | 'api'>('all');
  const [previewDoc, setPreviewDoc] = useState<Doc | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // AI Search state
  const [aiSearchEnabled, setAiSearchEnabled] = useState(false);
  const [aiSearchQuery, setAiSearchQuery] = useState('');
  const {
    answer: aiAnswer,
    sources: aiSources,
    documentIds: aiDocumentIds,
    isLoading: isAiLoading,
    error: aiError,
    setQuery: setAiQuery,
    clearAnswer: clearAiAnswer,
  } = useKnowledgeBaseSearch();

  // Upload form state
  const [uploadForm, setUploadForm] = useState({
    name: '',
    description: '',
    tags: '',
    file: null as File | null,
  });

  const formatFileSize = useCallback((bytes: number) => {
    if (bytes === 0) {
      return '0 Bytes';
    }
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  const getMimeTypeIcon = useCallback((mimeType: string) => {
    if (mimeType.includes('pdf')) {
      return '📄';
    }
    if (mimeType.includes('text')) {
      return '📝';
    }
    if (mimeType.includes('image')) {
      return '🖼️';
    }
    if (mimeType.includes('video')) {
      return '🎥';
    }
    if (mimeType.includes('audio')) {
      return '🎵';
    }
    return '📄';
  }, []);

  const handleUpload = async () => {
    if (!uploadForm.file || !uploadForm.name) {
      return;
    }
    
    setIsUploading(true);
    
    try {
      await uploadDoc({
        file: uploadForm.file,
        name: uploadForm.name,
        description: uploadForm.description || undefined,
        tags: uploadForm.tags 
          ? uploadForm.tags.split(',').map(tag => tag.trim()).filter(Boolean)
          : undefined,
      });
      
      setUploadDialogOpen(false);
      setUploadForm({ name: '', description: '', tags: '', file: null });
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = useCallback((doc: Doc) => {
    setSelectedDoc(doc);
    setDeleteDialogOpen(true);
  }, []);

  const confirmDelete = async () => {
    if (selectedDoc) {
      setIsDeleting(true);
      try {
        await removeDoc(selectedDoc.uuid);
        setDeleteDialogOpen(false);
        setSelectedDoc(null);
      } catch (error) {
        console.error('Delete failed:', error);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const handleDownload = useCallback((doc: Doc) => {
    try {
      downloadDoc(doc);
    } catch (error) {
      console.error('Download failed:', error);
    }
  }, [downloadDoc]);

  const handlePreview = useCallback((doc: Doc) => {
    setPreviewDoc(doc);
    setPreviewOpen(true);
  }, []);

  const handleDocumentIdClick = useCallback((documentId: string) => {
    // Find document by RAG document ID
    const doc = docs.find(d => d.rag_document_id === documentId);
    if (doc) {
      handlePreview(doc);
    } else {
      // If not found by rag_document_id, try to match by partial ID
      // This handles cases where the documentId is a Milvus document_id
      const matchingDoc = docs.find(d =>
        d.rag_document_id?.includes(documentId) ||
        d.uuid?.includes(documentId)
      );
      if (matchingDoc) {
        handlePreview(matchingDoc);
      }
    }
  }, [docs, handlePreview]);

  // Handle search input based on AI mode
  const handleSearchChange = useCallback((value: string) => {
    if (aiSearchEnabled) {
      setAiSearchQuery(value);
      setAiQuery(value);
    } else {
      setGlobalFilter(value);
    }
  }, [aiSearchEnabled, setAiQuery]);

  // Handle AI search toggle
  const handleAiSearchToggle = useCallback((enabled: boolean) => {
    setAiSearchEnabled(enabled);
    if (!enabled) {
      // Clear AI search when toggling off
      setAiSearchQuery('');
      clearAiAnswer();
    } else {
      // Clear regular search when toggling on
      setGlobalFilter('');
    }
  }, [clearAiAnswer]);

  // Update effect to sync search states
  useEffect(() => {
    if (aiSearchEnabled) {
      setGlobalFilter('');
    } else {
      setAiSearchQuery('');
      clearAiAnswer();
    }
  }, [aiSearchEnabled, clearAiAnswer]);

  // Table columns configuration
  const columns = useMemo(() => [
    columnHelper.accessor('name', {
      cell: (info) => (
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg flex-shrink-0">{getMimeTypeIcon(info.row.original.mime_type)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">
                {info.getValue()}
              </span>
              {info.row.original.version && info.row.original.version > 1 && (
                <Badge
                  variant="default"
                  className="text-xs flex-shrink-0"
                >
                  v{info.row.original.version}
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground truncate">{info.row.original.file_name}</div>
          </div>
        </div>
      ),
      header: t('page.tableHeaders.name'),
    }),
    columnHelper.accessor('description', {
      cell: (info) => {
        const desc = info.getValue();
        if (!desc) return <span className="text-muted-foreground text-sm">-</span>;

        // Truncate long descriptions
        const maxLength = 100;
        const truncated = desc.length > maxLength ? `${desc.substring(0, maxLength)}...` : desc;
        return (
          <span className="text-sm line-clamp-2" title={desc}>
            {truncated}
          </span>
        );
      },
      header: t('page.tableHeaders.description'),
    }),
    columnHelper.display({
      id: 'ai_model',
      cell: (info) => {
        const doc = info.row.original;
        if (doc.source === 'ai_generated' && doc.ai_metadata?.model) {
          return (
            <div className="flex flex-col gap-0.5">
              <div className="font-medium text-sm truncate">
                {doc.ai_metadata.model.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {doc.ai_metadata.model.provider}
                {doc.ai_metadata.model.version && ` v${doc.ai_metadata.model.version}`}
              </div>
            </div>
          );
        }
        return <span className="text-muted-foreground text-sm">-</span>;
      },
      header: t('page.tableHeaders.aiModel', 'AI Model'),
    }),
    columnHelper.accessor('file_size', {
      cell: (info) => (
        <span className="text-sm whitespace-nowrap">{formatFileSize(info.getValue())}</span>
      ),
      header: t('page.tableHeaders.size'),
    }),
    columnHelper.accessor('tags', {
      cell: (info) => {
        const tags = info.getValue();
        if (!tags || tags.length === 0) {
          return <span className="text-muted-foreground text-sm">-</span>;
        }

        // Join tags with commas for a cleaner, more readable display
        return (
          <div className="text-sm text-muted-foreground max-w-[200px]" title={tags.join(', ')}>
            <span className="line-clamp-2">
              {tags.join(', ')}
            </span>
          </div>
        );
      },
      header: t('page.tableHeaders.tags'),
    }),
    columnHelper.accessor('created_at', {
      cell: (info) => (
        <span className="text-sm whitespace-nowrap">{info.getValue().toLocaleDateString()}</span>
      ),
      header: t('page.tableHeaders.created'),
    }),
    columnHelper.display({
      id: 'actions',
      cell: (info) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handlePreview(info.row.original)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDownload(info.row.original)}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(info.row.original)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
      header: t('page.tableHeaders.actions'),
    }),
  ], [t, handleDownload, handleDelete, handlePreview, formatFileSize, getMimeTypeIcon]);

  // Filter docs based on source
  const filteredDocs = useMemo(() => docs.filter(doc => {
    if (sourceFilter === 'all') return true;
    // Default to 'upload' if source is not defined (backward compatibility)
    return (doc.source || 'upload') === sourceFilter;
  }), [docs, sourceFilter]);

  const table = useReactTable({
    data: filteredDocs,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    autoResetPageIndex: false,
    autoResetExpanded: false,
  });

  // Calculate stats
  const totalSize = storageUsage || 0; // Use actual storage usage from database
  const recentUploads = useMemo(() => docs.filter(doc => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return doc.created_at > weekAgo;
  }).length, [docs]);

  // Get filtered rows - the table handles memoization internally
  const filteredRows = table.getFilteredRowModel().rows;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>{t('page.loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <PageContainer>
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between flex-shrink-0">
          <div>
            <h1 className="text-3xl font-bold">{t('page.title')}</h1>
            <p className="text-muted-foreground">
              {t('page.description')}
            </p>
          </div>
          <div>
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              {t('uploadDialog.button')}
            </Button>
            <UploadDialog
              open={uploadDialogOpen}
              onOpenChange={setUploadDialogOpen}
              form={uploadForm}
              setForm={setUploadForm}
              isUploading={isUploading}
              onUpload={handleUpload}
              formatFileSize={formatFileSize}
              storageUsage={storageUsage}
            />
          </div>
        </div>

        {/* Upload Progress */}
        <UploadProgress />

        {/* Stats */}
        <DocsStats
          totalDocs={docs.length}
          totalSize={totalSize}
          recentUploads={recentUploads}
          formatFileSize={formatFileSize}
        />

        {/* Controls */}
        <div className='py-4'>
          <DocsControls
            searchTerm={aiSearchEnabled ? aiSearchQuery : globalFilter}
            onSearchChange={handleSearchChange}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sourceFilter={sourceFilter}
            onSourceFilterChange={setSourceFilter}
            aiSearchEnabled={aiSearchEnabled}
            onAiSearchToggle={handleAiSearchToggle}
          />
        </div>

        {/* AI Search Answer */}
        {aiSearchEnabled && (
          <AiSearchAnswer
            answer={aiAnswer}
            sources={aiSources}
            documentIds={aiDocumentIds}
            isLoading={isAiLoading}
            error={aiError}
            query={aiSearchQuery}
            onDocumentClick={handleDocumentIdClick}
          />
        )}

        {/* Content */}
        <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'grid' | 'table')} className="flex-1">
          <TabsContent value="grid" className="flex-1 overflow-auto">
            <DocsGrid
              docs={filteredRows.map(row => row.original)}
              onDownload={handleDownload}
              onDelete={handleDelete}
              onPreview={handlePreview}
              formatFileSize={formatFileSize}
              getMimeTypeIcon={getMimeTypeIcon}
            />
          </TabsContent>

          <TabsContent value="table" className="flex-1 overflow-auto">
            <DocsTable
              table={table}
            />
          </TabsContent>
        </Tabs>

        {/* Document Preview Modal */}
        <DocumentPreview
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          doc={previewDoc}
          docs={filteredRows.map(row => row.original)}
          onDocChange={setPreviewDoc}
          onDownload={handleDownload}
          onDelete={handleDelete}
          formatFileSize={formatFileSize}
        />

        {/* Delete Dialog */}
        <ConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title={t('deleteDialog.title')}
          description={t('deleteDialog.description', { name: selectedDoc?.name })}
          confirmText={isDeleting ? t('deleteDialog.deleting') : t('deleteDialog.delete')}
          cancelText={t('deleteDialog.cancel')}
          onConfirm={confirmDelete}
          isLoading={isDeleting}
          variant="destructive"
        />
      </div>
    </PageContainer>
  );
}