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
import { Badge, Download, Eye, Loader2, Trash2, Upload } from 'lucide-react';
import { useCallback,useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelAttributionBadge } from '@/components/library/ModelAttributionBadge';
// Internal components
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageContainer } from '@/components/ui/page-container';
import { Tabs, TabsContent } from '@/components/ui/tabs';
// Internal hooks and types
import { useLibrary } from '@/hooks/use-library';
import type { Doc } from '@/types/library';

// Local components
import { DocumentPreview } from './components/DocumentPreview';
import { DocsControls } from './components/DocsControls';
import { DocsGrid } from './components/DocsGrid';
import { DocsStats } from './components/DocsStats';
import { DocsTable } from './components/DocsTable';
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

  // Table columns configuration
  const columns = useMemo(() => [
    columnHelper.accessor('name', {
      cell: (info) => (
        <div className="flex items-center gap-2">
          <span className="text-lg">{getMimeTypeIcon(info.row.original.mime_type)}</span>
          <div>
            <div className="font-medium flex items-center gap-2">
              {info.getValue()}
              {info.row.original.source === 'ai_generated' && info.row.original.ai_metadata?.model && (
                <ModelAttributionBadge
                  modelName={info.row.original.ai_metadata.model.name}
                  modelProvider={info.row.original.ai_metadata.model.provider}
                  modelVersion={info.row.original.ai_metadata.model.version}
                  timestamp={info.row.original.ai_metadata.timestamp}
                />
              )}
            </div>
            <div className="text-sm text-muted-foreground">{info.row.original.file_name}</div>
          </div>
        </div>
      ),
      header: t('page.tableHeaders.name'),
    }),
    columnHelper.accessor('description', {
      cell: (info) => info.getValue() || '-',
      header: t('page.tableHeaders.description'),
    }),
    columnHelper.accessor('file_size', {
      cell: (info) => formatFileSize(info.getValue()),
      header: t('page.tableHeaders.size'),
    }),
    columnHelper.accessor('tags', {
      cell: (info) => (
        <div className="flex gap-1 flex-wrap">
          {info.getValue()?.map((tag, index) => (
            <Badge key={index} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          )) || '-'}
        </div>
      ),
      header: t('page.tableHeaders.tags'),
    }),
    columnHelper.accessor('created_at', {
      cell: (info) => info.getValue().toLocaleDateString(),
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
            searchTerm={globalFilter}
            onSearchChange={setGlobalFilter}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sourceFilter={sourceFilter}
            onSourceFilterChange={setSourceFilter}
          />
        </div>

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