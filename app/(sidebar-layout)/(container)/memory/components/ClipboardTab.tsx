'use client';

import {
  Clock,
  Copy,
  Edit,
  Eye,
  FileText,
  Image,
  MoreHorizontal,
  Plus,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { buildSafeImageDataUrl,isSafeImageType, isTextLikeEntry } from '@/lib/clipboard/client';

import type { ClipboardEntry } from '../hooks/useClipboard';
import { useClipboard } from '../hooks/useClipboard';

interface ClipboardTabProps {
  entries: ClipboardEntry[];
  onRefresh: () => void;
}

type EntryFormData = {
  name: string;
  value: string;
  contentType: string;
  encoding: 'utf-8' | 'base64' | 'hex';
  visibility: 'private' | 'workspace' | 'public';
  ttlSeconds: number;
};

export function ClipboardTab({ entries, onRefresh }: ClipboardTabProps) {
  const { t } = useTranslation(['memory', 'common']);
  const { toast } = useToast();
  const { setEntry, deleteEntry } = useClipboard();
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [selectedEntry, setSelectedEntry] = useState<ClipboardEntry | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [clearAllDialogOpen, setClearAllDialogOpen] = useState(false);
  const [createEditOpen, setCreateEditOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<EntryFormData>({
    name: '',
    value: '',
    contentType: 'text/plain',
    encoding: 'utf-8',
    visibility: 'private',
    ttlSeconds: 86400,
  });

  // Separate named and indexed entries
  const namedEntries = entries.filter(e => e.name !== null);
  const indexedEntries = entries.filter(e => e.idx !== null);

  const handleCopy = async (entry: ClipboardEntry) => {
    // Only allow copying text-like entries to system clipboard
    if (!isTextLikeEntry({ contentType: entry.contentType, encoding: entry.encoding })) {
      toast({
        title: t('common.warning'),
        description: t('clipboard.toast.cannotCopyBinary'),
        variant: 'destructive',
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(entry.value);
      toast({
        title: t('common.success'),
        description: t('clipboard.toast.copied'),
      });
    } catch (error) {
      console.error('Failed to copy:', error);
      toast({
        title: t('common.error'),
        description: t('clipboard.toast.copyFailed'),
        variant: 'destructive',
      });
    }
  };

  const handlePreview = (entry: ClipboardEntry) => {
    setSelectedEntry(entry);
    setPreviewOpen(true);
  };

  const handleDelete = (entry: ClipboardEntry) => {
    setSelectedEntry(entry);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedEntry) return;

    setIsDeleting(true);
    try {
      await deleteEntry({
        name: selectedEntry.name ?? undefined,
        idx: selectedEntry.idx ?? undefined,
      });
      setDeleteDialogOpen(false);
      setSelectedEntry(null);
      onRefresh();
      toast({
        title: t('common.success'),
        description: t('clipboard.toast.deleted'),
      });
    } catch (error) {
      console.error('Delete failed:', error);
      toast({
        title: t('common.error'),
        description: t('clipboard.toast.deleteFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmClearAll = async () => {
    setIsDeleting(true);
    try {
      await deleteEntry({ clearAll: true });
      setClearAllDialogOpen(false);
      onRefresh();
      toast({
        title: t('common.success'),
        description: t('clipboard.toast.clearedAll'),
      });
    } catch (error) {
      console.error('Clear all failed:', error);
      toast({
        title: t('common.error'),
        description: t('clipboard.toast.clearAllFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateNew = () => {
    setSelectedEntry(null);
    setFormData({
      name: '',
      value: '',
      contentType: 'text/plain',
      encoding: 'utf-8',
      visibility: 'private',
      ttlSeconds: 86400,
    });
    setCreateEditOpen(true);
  };

  const handleEdit = (entry: ClipboardEntry) => {
    setSelectedEntry(entry);
    setFormData({
      name: entry.name || '',
      value: entry.value,
      contentType: entry.contentType,
      encoding: entry.encoding as 'utf-8' | 'base64' | 'hex',
      visibility: entry.visibility as 'private' | 'workspace' | 'public',
      ttlSeconds: 86400, // Default to 24h for edits
    });
    setCreateEditOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.value.trim()) return;

    setIsSubmitting(true);
    try {
      await setEntry({
        name: formData.name.trim(),
        value: formData.value,
        contentType: formData.contentType,
        encoding: formData.encoding,
        visibility: formData.visibility,
        ttlSeconds: formData.ttlSeconds,
      });
      setCreateEditOpen(false);
      onRefresh();
      toast({
        title: t('common.success'),
        description: selectedEntry
          ? t('clipboard.toast.updated')
          : t('clipboard.toast.created'),
      });
    } catch (error) {
      console.error('Failed to save entry:', error);
      toast({
        title: t('common.error'),
        description: t('clipboard.toast.saveFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const getTimeRemaining = (expiresAt: string | null): string => {
    if (!expiresAt) return 'Never';
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();

    if (diff < 0) return 'Expired';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  };

  const getContentTypeIcon = (contentType: string) => {
    if (contentType.startsWith('image/')) return <Image className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const truncateValue = (value: string, maxLength: number = 100): string => {
    if (value.length <= maxLength) return value;
    return value.substring(0, maxLength) + '...';
  };

  if (entries.length === 0) {
    return (
      <>
        <Card className="h-64 flex items-center justify-center">
          <CardContent className="text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle className="mb-2">{t('clipboard.empty.title')}</CardTitle>
            <CardDescription className="mb-4">{t('clipboard.empty.description')}</CardDescription>
            <Button onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              {t('clipboard.createEntry')}
            </Button>
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <EntryFormDialog
          open={createEditOpen}
          onOpenChange={setCreateEditOpen}
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          isEdit={false}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'table' | 'grid')}>
          <TabsList>
            <TabsTrigger value="table">{t('clipboard.viewMode.table')}</TabsTrigger>
            <TabsTrigger value="grid">{t('clipboard.viewMode.grid')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Button onClick={handleCreateNew}>
            <Plus className="h-4 w-4 mr-2" />
            {t('clipboard.createEntry')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setClearAllDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('clipboard.clearAll')}
          </Button>
        </div>
      </div>

      {/* Named Entries Section */}
      {namedEntries.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Tag className="h-5 w-5" />
            {t('clipboard.named')} ({namedEntries.length})
          </h3>
          {viewMode === 'table' ? (
            <ClipboardTable
              entries={namedEntries}
              showName
              onCopy={handleCopy}
              onPreview={handlePreview}
              onEdit={handleEdit}
              onDelete={handleDelete}
              formatBytes={formatBytes}
              formatDate={formatDate}
              getTimeRemaining={getTimeRemaining}
              getContentTypeIcon={getContentTypeIcon}
              truncateValue={truncateValue}
            />
          ) : (
            <ClipboardGrid
              entries={namedEntries}
              showName
              onCopy={handleCopy}
              onPreview={handlePreview}
              onEdit={handleEdit}
              onDelete={handleDelete}
              formatBytes={formatBytes}
              getTimeRemaining={getTimeRemaining}
              getContentTypeIcon={getContentTypeIcon}
              truncateValue={truncateValue}
            />
          )}
        </div>
      )}

      {/* Indexed Entries Section */}
      {indexedEntries.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('clipboard.indexed')} ({indexedEntries.length})
          </h3>
          {viewMode === 'table' ? (
            <ClipboardTable
              entries={indexedEntries}
              showIdx
              onCopy={handleCopy}
              onPreview={handlePreview}
              onEdit={handleEdit}
              onDelete={handleDelete}
              formatBytes={formatBytes}
              formatDate={formatDate}
              getTimeRemaining={getTimeRemaining}
              getContentTypeIcon={getContentTypeIcon}
              truncateValue={truncateValue}
            />
          ) : (
            <ClipboardGrid
              entries={indexedEntries}
              showIdx
              onCopy={handleCopy}
              onPreview={handlePreview}
              onEdit={handleEdit}
              onDelete={handleDelete}
              formatBytes={formatBytes}
              getTimeRemaining={getTimeRemaining}
              getContentTypeIcon={getContentTypeIcon}
              truncateValue={truncateValue}
            />
          )}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedEntry?.name || `Index ${selectedEntry?.idx}`}
            </DialogTitle>
            <DialogDescription>
              {selectedEntry?.contentType} - {selectedEntry && formatBytes(selectedEntry.sizeBytes)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-4">
            {/* Content Area */}
            <div className="flex-1 overflow-auto max-h-[60vh]">
              {selectedEntry && isSafeImageType(selectedEntry.contentType) ? (
                <img
                  src={buildSafeImageDataUrl(selectedEntry.contentType, selectedEntry.encoding, selectedEntry.value) ?? ''}
                  alt="Clipboard content"
                  className="max-w-full h-auto"
                />
              ) : selectedEntry?.contentType.startsWith('image/') ? (
                <div className="bg-muted p-4 rounded-md text-sm text-muted-foreground">
                  <p>{t('clipboard.preview.unsafeImageType')}</p>
                  <p className="text-xs mt-1">{t('clipboard.preview.contentType')}: {selectedEntry.contentType}</p>
                </div>
              ) : (
                <pre className="bg-muted p-4 rounded-md overflow-auto text-sm whitespace-pre-wrap break-all h-full">
                  {selectedEntry?.value}
                </pre>
              )}
            </div>

            {/* Info Pane - Right Side */}
            <div className="w-64 shrink-0 border-l pl-4 space-y-3">
              <h4 className="text-sm font-medium text-foreground">{t('clipboard.preview.details')}</h4>
              <div className="space-y-3 text-sm">
                {/* Source */}
                <div>
                  <div className="text-muted-foreground text-xs mb-1">{t('clipboard.preview.source')}</div>
                  <Badge variant={selectedEntry?.source === 'mcp' ? 'default' : selectedEntry?.source === 'sdk' ? 'secondary' : 'outline'}>
                    {selectedEntry?.source === 'mcp' ? t('clipboard.preview.sourceMcp') :
                     selectedEntry?.source === 'sdk' ? t('clipboard.preview.sourceSdk') :
                     t('clipboard.preview.sourceUi')}
                  </Badge>
                </div>

                {/* Visibility */}
                <div>
                  <div className="text-muted-foreground text-xs mb-1">{t('clipboard.preview.visibility')}</div>
                  <div className="capitalize">{selectedEntry?.visibility}</div>
                </div>

                {/* Encoding */}
                <div>
                  <div className="text-muted-foreground text-xs mb-1">{t('clipboard.preview.encoding')}</div>
                  <div className="font-mono text-xs">{selectedEntry?.encoding}</div>
                </div>

                {/* Created At */}
                <div>
                  <div className="text-muted-foreground text-xs mb-1">{t('clipboard.preview.createdAt')}</div>
                  <div className="text-xs">{selectedEntry?.createdAt ? new Date(selectedEntry.createdAt).toLocaleString() : '-'}</div>
                </div>

                {/* Updated At */}
                <div>
                  <div className="text-muted-foreground text-xs mb-1">{t('clipboard.preview.updatedAt')}</div>
                  <div className="text-xs">{selectedEntry?.updatedAt ? new Date(selectedEntry.updatedAt).toLocaleString() : '-'}</div>
                </div>

                {/* Expires At */}
                <div>
                  <div className="text-muted-foreground text-xs mb-1">{t('clipboard.preview.expiresAt')}</div>
                  <div className="text-xs">{selectedEntry?.expiresAt ? new Date(selectedEntry.expiresAt).toLocaleString() : t('clipboard.preview.noExpiration')}</div>
                </div>

                {/* Created By Tool */}
                {selectedEntry?.createdByTool && (
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">{t('clipboard.preview.tool')}</div>
                    <Badge variant="outline" className="text-xs">{selectedEntry.createdByTool}</Badge>
                  </div>
                )}

                {/* Created By Model */}
                {selectedEntry?.createdByModel && (
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">{t('clipboard.preview.model')}</div>
                    <Badge variant="outline" className="text-xs">{selectedEntry.createdByModel}</Badge>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t('clipboard.deleteDialog.title')}
        description={t('clipboard.deleteDialog.description', {
          identifier: selectedEntry?.name || `Index ${selectedEntry?.idx}`,
        })}
        confirmText={isDeleting ? t('clipboard.deleteDialog.deleting') : t('clipboard.deleteDialog.delete')}
        cancelText={t('clipboard.deleteDialog.cancel')}
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        variant="destructive"
      />

      {/* Clear All Confirmation */}
      <ConfirmDialog
        open={clearAllDialogOpen}
        onOpenChange={setClearAllDialogOpen}
        title={t('clipboard.clearAllDialog.title')}
        description={t('clipboard.clearAllDialog.description', { count: entries.length })}
        confirmText={isDeleting ? t('clipboard.clearAllDialog.clearing') : t('clipboard.clearAllDialog.clear')}
        cancelText={t('clipboard.clearAllDialog.cancel')}
        onConfirm={confirmClearAll}
        isLoading={isDeleting}
        variant="destructive"
      />

      {/* Create/Edit Dialog */}
      <EntryFormDialog
        open={createEditOpen}
        onOpenChange={setCreateEditOpen}
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        isEdit={selectedEntry !== null}
      />
    </div>
  );
}

interface EntryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: EntryFormData;
  setFormData: (data: EntryFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
  isEdit: boolean;
}

function EntryFormDialog({
  open,
  onOpenChange,
  formData,
  setFormData,
  onSubmit,
  isSubmitting,
  isEdit,
}: EntryFormDialogProps) {
  const { t } = useTranslation(['memory', 'common']);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // Max file size: 2MB (to stay under the backend limit)
  const MAX_FILE_SIZE = 2 * 1024 * 1024;

  const handleFileSelect = useCallback((file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: t('common.error'),
        description: t('clipboard.form.fileTooLarge', { maxSize: '2MB' }),
        variant: 'destructive',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      // Remove the data:mime;base64, prefix to get just the base64 content
      const base64Content = result.split(',')[1];

      setFormData({
        ...formData,
        value: base64Content,
        contentType: file.type || 'application/octet-stream',
        encoding: 'base64',
      });
      setUploadedFileName(file.name);
    };
    reader.onerror = () => {
      toast({
        title: t('common.error'),
        description: t('clipboard.form.fileReadError'),
        variant: 'destructive',
      });
    };
    reader.readAsDataURL(file);
  }, [formData, setFormData, t, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const clearUploadedFile = useCallback(() => {
    setUploadedFileName(null);
    setFormData({
      ...formData,
      value: '',
      contentType: 'text/plain',
      encoding: 'utf-8',
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [formData, setFormData]);

  const isFileUpload = uploadedFileName !== null;
  // Only show image preview for safe, whitelisted image types to prevent XSS
  const isImagePreview = isSafeImageType(formData.contentType) && formData.encoding === 'base64';

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen) {
        setUploadedFileName(null);
      }
      onOpenChange(newOpen);
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('clipboard.form.editTitle') : t('clipboard.form.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? t('clipboard.form.editDescription') : t('clipboard.form.createDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">{t('clipboard.form.name')} *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('clipboard.form.namePlaceholder')}
                required
                disabled={isEdit}
              />
              <p className="text-sm text-muted-foreground">
                {t('clipboard.form.nameHelp')}
              </p>
            </div>

            {/* File Upload / Value */}
            <div className="space-y-2">
              <Label>{t('clipboard.form.value')} *</Label>

              {/* File Upload Dropzone */}
              {!isFileUpload && !isEdit && (
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isDragging
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-primary/50'
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileInputChange}
                    accept="image/*,application/pdf,application/json,text/*"
                    aria-label={t('clipboard.form.uploadFile')}
                  />
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {t('clipboard.form.dropzoneText')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('clipboard.form.dropzoneHint', { maxSize: '2MB' })}
                  </p>
                </div>
              )}

              {/* Uploaded File Preview */}
              {isFileUpload && (
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {isImagePreview ? (
                        <Image className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium">{uploadedFileName}</span>
                      <Badge variant="outline" className="text-xs">
                        {formData.contentType}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearUploadedFile}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {isImagePreview && (
                    <div className="mt-2 max-h-48 overflow-hidden rounded-md bg-muted flex items-center justify-center">
                      <img
                        src={buildSafeImageDataUrl(formData.contentType, 'base64', formData.value) ?? ''}
                        alt="Preview"
                        className="max-h-48 max-w-full object-contain"
                      />
                    </div>
                  )}
                  {!isImagePreview && (
                    <p className="text-xs text-muted-foreground">
                      {t('clipboard.form.fileUploaded', { size: Math.round(formData.value.length * 0.75 / 1024) + 'KB' })}
                    </p>
                  )}
                </div>
              )}

              {/* Text Input (show if no file uploaded or in edit mode) */}
              {(!isFileUpload || isEdit) && !isImagePreview && (
                <>
                  {!isEdit && !isFileUpload && (
                    <div className="relative flex items-center my-2">
                      <div className="flex-1 border-t border-muted-foreground/25" />
                      <span className="px-3 text-xs text-muted-foreground">{t('clipboard.form.or')}</span>
                      <div className="flex-1 border-t border-muted-foreground/25" />
                    </div>
                  )}
                  <Textarea
                    id="value"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    placeholder={t('clipboard.form.valuePlaceholder')}
                    rows={6}
                    required={!isFileUpload}
                    className="font-mono text-sm"
                  />
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Content Type */}
              <div className="space-y-2">
                <Label htmlFor="contentType">{t('clipboard.form.contentType')}</Label>
                <Select
                  value={formData.contentType}
                  onValueChange={(value) => setFormData({ ...formData, contentType: value })}
                  disabled={isFileUpload}
                >
                  <SelectTrigger id="contentType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text/plain">text/plain</SelectItem>
                    <SelectItem value="application/json">application/json</SelectItem>
                    <SelectItem value="text/markdown">text/markdown</SelectItem>
                    <SelectItem value="text/html">text/html</SelectItem>
                    <SelectItem value="image/png">image/png</SelectItem>
                    <SelectItem value="image/jpeg">image/jpeg</SelectItem>
                    <SelectItem value="image/gif">image/gif</SelectItem>
                    <SelectItem value="image/webp">image/webp</SelectItem>
                    <SelectItem value="application/pdf">application/pdf</SelectItem>
                    <SelectItem value="application/octet-stream">binary</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Encoding */}
              <div className="space-y-2">
                <Label htmlFor="encoding">{t('clipboard.form.encoding')}</Label>
                <Select
                  value={formData.encoding}
                  onValueChange={(value) =>
                    setFormData({ ...formData, encoding: value as 'utf-8' | 'base64' | 'hex' })
                  }
                  disabled={isFileUpload}
                >
                  <SelectTrigger id="encoding">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utf-8">UTF-8</SelectItem>
                    <SelectItem value="base64">Base64</SelectItem>
                    <SelectItem value="hex">Hex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Visibility */}
              <div className="space-y-2">
                <Label htmlFor="visibility">{t('clipboard.form.visibility')}</Label>
                <Select
                  value={formData.visibility}
                  onValueChange={(value) =>
                    setFormData({ ...formData, visibility: value as 'private' | 'workspace' | 'public' })
                  }
                >
                  <SelectTrigger id="visibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">{t('clipboard.form.visibilityPrivate')}</SelectItem>
                    <SelectItem value="workspace">{t('clipboard.form.visibilityWorkspace')}</SelectItem>
                    <SelectItem value="public">{t('clipboard.form.visibilityPublic')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* TTL */}
              <div className="space-y-2">
                <Label htmlFor="ttl">{t('clipboard.form.ttl')}</Label>
                <Select
                  value={formData.ttlSeconds.toString()}
                  onValueChange={(value) => setFormData({ ...formData, ttlSeconds: parseInt(value) })}
                >
                  <SelectTrigger id="ttl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="900">15 {t('clipboard.form.minutes')}</SelectItem>
                    <SelectItem value="3600">1 {t('clipboard.form.hour')}</SelectItem>
                    <SelectItem value="14400">4 {t('clipboard.form.hours')}</SelectItem>
                    <SelectItem value="86400">24 {t('clipboard.form.hours')}</SelectItem>
                    <SelectItem value="604800">7 {t('clipboard.form.days')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('clipboard.form.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || !formData.name.trim() || !formData.value.trim()}>
              {isSubmitting ? t('clipboard.form.saving') : (isEdit ? t('clipboard.form.update') : t('clipboard.form.create'))}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ClipboardTableProps {
  entries: ClipboardEntry[];
  showName?: boolean;
  showIdx?: boolean;
  onCopy: (entry: ClipboardEntry) => void;
  onPreview: (entry: ClipboardEntry) => void;
  onEdit: (entry: ClipboardEntry) => void;
  onDelete: (entry: ClipboardEntry) => void;
  formatBytes: (bytes: number) => string;
  formatDate: (date: string) => string;
  getTimeRemaining: (expiresAt: string | null) => string;
  getContentTypeIcon: (contentType: string) => React.ReactNode;
  truncateValue: (value: string, maxLength?: number) => string;
}

function ClipboardTable({
  entries,
  showName,
  showIdx,
  onCopy,
  onPreview,
  onEdit,
  onDelete,
  formatBytes,
  formatDate,
  getTimeRemaining,
  getContentTypeIcon,
  truncateValue,
}: ClipboardTableProps) {
  const { t } = useTranslation(['memory', 'common']);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {showName && <TableHead>{t('clipboard.table.name')}</TableHead>}
            {showIdx && <TableHead>{t('clipboard.table.index')}</TableHead>}
            <TableHead>{t('clipboard.table.type')}</TableHead>
            <TableHead>{t('clipboard.table.value')}</TableHead>
            <TableHead>{t('clipboard.table.size')}</TableHead>
            <TableHead>{t('clipboard.table.expires')}</TableHead>
            <TableHead className="w-[100px]">{t('clipboard.table.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.uuid}>
              {showName && (
                <TableCell className="font-medium">
                  <button
                    type="button"
                    onClick={() => onPreview(entry)}
                    className="hover:underline hover:text-primary cursor-pointer text-left"
                  >
                    {entry.name}
                  </button>
                </TableCell>
              )}
              {showIdx && (
                <TableCell className="font-mono">
                  <button
                    type="button"
                    onClick={() => onPreview(entry)}
                    className="hover:underline hover:text-primary cursor-pointer"
                  >
                    {entry.idx}
                  </button>
                </TableCell>
              )}
              <TableCell>
                <div className="flex items-center gap-2">
                  {getContentTypeIcon(entry.contentType)}
                  <span className="text-sm text-muted-foreground">
                    {entry.contentType}
                  </span>
                </div>
              </TableCell>
              <TableCell className="max-w-xs">
                <span className="text-sm font-mono truncate block">
                  {entry.contentType.startsWith('image/')
                    ? '[Image data]'
                    : truncateValue(entry.value, 50)}
                </span>
              </TableCell>
              <TableCell>{formatBytes(entry.sizeBytes)}</TableCell>
              <TableCell>
                <Badge variant="outline">{getTimeRemaining(entry.expiresAt)}</Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onPreview(entry)}>
                      <Eye className="h-4 w-4 mr-2" />
                      {t('clipboard.actions.preview')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onCopy(entry)}>
                      <Copy className="h-4 w-4 mr-2" />
                      {t('clipboard.actions.copy')}
                    </DropdownMenuItem>
                    {showName && (
                      <DropdownMenuItem onClick={() => onEdit(entry)}>
                        <Edit className="h-4 w-4 mr-2" />
                        {t('clipboard.actions.edit')}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => onDelete(entry)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t('clipboard.actions.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface ClipboardGridProps {
  entries: ClipboardEntry[];
  showName?: boolean;
  showIdx?: boolean;
  onCopy: (entry: ClipboardEntry) => void;
  onPreview: (entry: ClipboardEntry) => void;
  onEdit: (entry: ClipboardEntry) => void;
  onDelete: (entry: ClipboardEntry) => void;
  formatBytes: (bytes: number) => string;
  getTimeRemaining: (expiresAt: string | null) => string;
  getContentTypeIcon: (contentType: string) => React.ReactNode;
  truncateValue: (value: string, maxLength?: number) => string;
}

function ClipboardGrid({
  entries,
  showName,
  showIdx,
  onCopy,
  onPreview,
  onEdit,
  onDelete,
  formatBytes,
  getTimeRemaining,
  getContentTypeIcon,
  truncateValue,
}: ClipboardGridProps) {
  const { t } = useTranslation(['memory', 'common']);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {entries.map((entry) => (
        <Card key={entry.uuid} className="relative">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getContentTypeIcon(entry.contentType)}
                <CardTitle className="text-sm">
                  <button
                    type="button"
                    onClick={() => onPreview(entry)}
                    className="hover:underline hover:text-primary cursor-pointer text-left"
                  >
                    {showName ? entry.name : `#${entry.idx}`}
                  </button>
                </CardTitle>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onPreview(entry)}>
                    <Eye className="h-4 w-4 mr-2" />
                    {t('clipboard.actions.preview')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onCopy(entry)}>
                    <Copy className="h-4 w-4 mr-2" />
                    {t('clipboard.actions.copy')}
                  </DropdownMenuItem>
                  {showName && (
                    <DropdownMenuItem onClick={() => onEdit(entry)}>
                      <Edit className="h-4 w-4 mr-2" />
                      {t('clipboard.actions.edit')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => onDelete(entry)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('clipboard.actions.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <CardDescription className="text-xs">
              {entry.contentType} - {formatBytes(entry.sizeBytes)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="bg-muted rounded-md p-2 mb-2 max-h-24 overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
              onClick={() => onPreview(entry)}
            >
              {isSafeImageType(entry.contentType) && entry.encoding === 'base64' ? (
                <img
                  src={buildSafeImageDataUrl(entry.contentType, entry.encoding, entry.value) ?? ''}
                  alt={entry.name || `Index ${entry.idx}`}
                  className="max-h-20 max-w-full object-contain mx-auto"
                />
              ) : entry.contentType.startsWith('image/') ? (
                <div className="text-sm text-muted-foreground italic text-center py-4">
                  <Image className="h-8 w-8 mx-auto mb-1 opacity-50" />
                  [Image]
                </div>
              ) : (
                <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                  {truncateValue(entry.value, 150)}
                </pre>
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <Badge variant="outline" className="text-xs">
                {getTimeRemaining(entry.expiresAt)}
              </Badge>
              {entry.createdByTool && (
                <span className="truncate max-w-[100px]">{entry.createdByTool}</span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
