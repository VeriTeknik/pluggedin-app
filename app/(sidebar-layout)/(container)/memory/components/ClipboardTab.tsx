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
} from 'lucide-react';
import { useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

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
  const { t } = useTranslation('memory');
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
    try {
      await navigator.clipboard.writeText(entry.value);
      // TODO: Add toast notification
    } catch (error) {
      console.error('Failed to copy:', error);
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
    } catch (error) {
      console.error('Delete failed:', error);
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
    } catch (error) {
      console.error('Clear all failed:', error);
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
    } catch (error) {
      console.error('Failed to save entry:', error);
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
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedEntry?.name || `Index ${selectedEntry?.idx}`}
            </DialogTitle>
            <DialogDescription>
              {selectedEntry?.contentType} - {selectedEntry && formatBytes(selectedEntry.sizeBytes)}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh]">
            {selectedEntry?.contentType.startsWith('image/') ? (
              <img
                src={`data:${selectedEntry.contentType};${selectedEntry.encoding},${selectedEntry.value}`}
                alt="Clipboard content"
                className="max-w-full h-auto"
              />
            ) : (
              <pre className="bg-muted p-4 rounded-md overflow-auto text-sm whitespace-pre-wrap break-all">
                {selectedEntry?.value}
              </pre>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-4">
            {selectedEntry?.createdByTool && (
              <Badge variant="outline">{selectedEntry.createdByTool}</Badge>
            )}
            {selectedEntry?.createdByModel && (
              <Badge variant="outline">{selectedEntry.createdByModel}</Badge>
            )}
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
  const { t } = useTranslation('memory');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

            {/* Value */}
            <div className="space-y-2">
              <Label htmlFor="value">{t('clipboard.form.value')} *</Label>
              <Textarea
                id="value"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                placeholder={t('clipboard.form.valuePlaceholder')}
                rows={6}
                required
                className="font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Content Type */}
              <div className="space-y-2">
                <Label htmlFor="contentType">{t('clipboard.form.contentType')}</Label>
                <Select
                  value={formData.contentType}
                  onValueChange={(value) => setFormData({ ...formData, contentType: value })}
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
  const { t } = useTranslation('memory');

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
                <TableCell className="font-medium">{entry.name}</TableCell>
              )}
              {showIdx && (
                <TableCell className="font-mono">{entry.idx}</TableCell>
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
  const { t } = useTranslation('memory');

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {entries.map((entry) => (
        <Card key={entry.uuid} className="relative">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getContentTypeIcon(entry.contentType)}
                <CardTitle className="text-sm">
                  {showName ? entry.name : `#${entry.idx}`}
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
            <div className="bg-muted rounded-md p-2 mb-2 max-h-24 overflow-hidden">
              {entry.contentType.startsWith('image/') ? (
                <div className="text-sm text-muted-foreground italic">
                  [Image data]
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
