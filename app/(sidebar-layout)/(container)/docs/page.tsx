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
import { Badge, Download, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// Internal components
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
// Internal hooks and types
import { useDocs } from '@/hooks/use-docs';
import type { Doc } from '@/types/docs';

// Local components
import { DeleteDialog } from './components/DeleteDialog';
import { DocsControls } from './components/DocsControls';
import { DocsGrid } from './components/DocsGrid';
import { DocsStats } from './components/DocsStats';
import { DocsTable } from './components/DocsTable';
import { UploadDialog } from './components/UploadDialog';
import { UploadProgress } from './components/UploadProgress';

const columnHelper = createColumnHelper<Doc>();

export default function DocsPage() {
  const { t } = useTranslation('docs');
  const { docs, isLoading, storageUsage, uploadDoc, removeDoc, downloadDoc } = useDocs();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Upload form state
  const [uploadForm, setUploadForm] = useState({
    name: '',
    description: '',
    tags: '',
    file: null as File | null,
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) {
      return '0 Bytes';
    }
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getMimeTypeIcon = (mimeType: string) => {
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
  };

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

  const handleDelete = (doc: Doc) => {
    setSelectedDoc(doc);
    setDeleteDialogOpen(true);
  };

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

  const handleDownload = (doc: Doc) => {
    try {
      downloadDoc(doc);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  // Table columns configuration
  const columns = [
    columnHelper.accessor('name', {
      cell: (info) => (
        <div className="flex items-center gap-2">
          <span className="text-lg">{getMimeTypeIcon(info.row.original.mime_type)}</span>
          <div>
            <div className="font-medium">{info.getValue()}</div>
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
  ];

  const table = useReactTable({
    data: docs,
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
  });

  // Calculate stats
  const totalSize = storageUsage || 0; // Use actual storage usage from database
  const recentUploads = docs.filter(doc => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return doc.created_at > weekAgo;
  }).length;

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>{t('page.loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('page.title')}</h1>
          <p className="text-muted-foreground">
            {t('page.description')}
          </p>
        </div>
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
      <DocsControls
        searchTerm={globalFilter}
        onSearchChange={setGlobalFilter}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* Content */}
      <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'grid' | 'table')}>
        <TabsContent value="grid" className="space-y-4">
          <DocsGrid
            docs={table.getFilteredRowModel().rows.map(row => row.original)}
            onDownload={handleDownload}
            onDelete={handleDelete}
            formatFileSize={formatFileSize}
            getMimeTypeIcon={getMimeTypeIcon}
          />
        </TabsContent>

        <TabsContent value="table">
          <DocsTable
            table={table}
          />
        </TabsContent>
      </Tabs>

      {/* Delete Dialog */}
      <DeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        doc={selectedDoc}
        onConfirm={confirmDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
} 