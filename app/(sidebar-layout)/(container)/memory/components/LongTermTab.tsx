'use client';

import {
  ChevronDown,
  Database,
  Eye,
  Loader2,
  Search,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import type { RingType } from '@/lib/memory/types';

import { useMemoryRing } from '../hooks/useMemoryRing';
import { useMemorySearch } from '../hooks/useMemorySearch';
import { getDecayColor, getRingColor } from '../utils';

interface LongTermTabProps {
  onRefresh?: () => void;
}

interface MemoryEntry {
  uuid: string;
  ring_type: string;
  content_summary: string | null;
  content_essence: string | null;
  content_full: string | null;
  current_decay_stage: string;
  current_token_count: number;
  access_count: number;
  relevance_score: number;
  success_score: number | null;
  reinforcement_count: number;
  is_shock: boolean;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
}

const RING_TYPES: Array<{ value: RingType | 'all'; label: string }> = [
  { value: 'all', label: 'All Rings' },
  { value: 'longterm', label: 'Long-term' },
  { value: 'practice', label: 'Practice' },
  { value: 'procedures', label: 'Procedures' },
  { value: 'shocks', label: 'Shocks' },
];

export function LongTermTab({ onRefresh }: LongTermTabProps) {
  const { t } = useTranslation('memory');
  const [selectedRing, setSelectedRing] = useState<RingType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewMemory, setPreviewMemory] = useState<MemoryEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MemoryEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { memories, isLoading, refresh, removeMemory } = useMemoryRing(
    selectedRing === 'all' ? undefined : { ringType: selectedRing }
  );
  const { results: searchResults, isSearching, search, clear } = useMemorySearch();

  const typedMemories = memories as unknown as MemoryEntry[];
  const displayMemories = searchQuery && searchResults.length > 0
    ? searchResults as unknown as MemoryEntry[]
    : typedMemories;

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      clear();
      return;
    }
    await search({
      query: searchQuery,
      ringTypes: selectedRing === 'all' ? undefined : [selectedRing],
      topK: 20,
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await removeMemory(deleteTarget.uuid);
      setDeleteTarget(null);
    } catch {
      // Error handled by hook
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('longterm.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-10"
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleSearch} disabled={isSearching}>
          {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : t('longterm.search')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {RING_TYPES.find(r => r.value === selectedRing)?.label}
              <ChevronDown className="h-4 w-4 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {RING_TYPES.map((ring) => (
              <DropdownMenuItem
                key={ring.value}
                onClick={() => { setSelectedRing(ring.value); clear(); }}
              >
                {ring.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Memory Table */}
      {displayMemories.length === 0 ? (
        <Card className="h-48 flex items-center justify-center">
          <CardContent className="text-center">
            <Database className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <CardTitle className="text-sm mb-1">{t('longterm.empty.title')}</CardTitle>
            <CardDescription className="text-xs">{t('longterm.empty.description')}</CardDescription>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">{t('longterm.table.ring')}</TableHead>
              <TableHead>{t('longterm.table.content')}</TableHead>
              <TableHead className="w-[80px]">{t('longterm.table.decay')}</TableHead>
              <TableHead className="w-[80px]">{t('longterm.table.relevance')}</TableHead>
              <TableHead className="w-[60px]">{t('longterm.table.hits')}</TableHead>
              <TableHead className="w-[80px]">{t('longterm.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayMemories.map((memory) => (
              <TableRow key={memory.uuid}>
                <TableCell>
                  <Badge variant="outline" className={`text-xs ${getRingColor(memory.ring_type)}`}>
                    {memory.ring_type}
                  </Badge>
                  {memory.is_shock && (
                    <Badge variant="destructive" className="text-xs ml-1">!</Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-[400px]">
                  <p className="text-sm truncate">
                    {memory.content_summary || memory.content_essence || memory.content_full?.substring(0, 100) || '—'}
                  </p>
                  {memory.tags && memory.tags.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {memory.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                      ))}
                      {memory.tags.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{memory.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-xs ${getDecayColor(memory.current_decay_stage)}`}>
                    {memory.current_decay_stage}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${Math.round((memory.relevance_score ?? 0) * 40)}px` }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {Math.round((memory.relevance_score ?? 0) * 100)}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-center">
                  {memory.access_count}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewMemory(memory)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(memory)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Memory Detail Dialog */}
      <Dialog open={!!previewMemory} onOpenChange={() => setPreviewMemory(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('longterm.detail.title')}</DialogTitle>
            <DialogDescription>
              {previewMemory && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={getRingColor(previewMemory.ring_type)}>
                    {previewMemory.ring_type}
                  </Badge>
                  <Badge variant="outline" className={getDecayColor(previewMemory.current_decay_stage)}>
                    {previewMemory.current_decay_stage}
                  </Badge>
                  {previewMemory.is_shock && (
                    <Badge variant="destructive">Shock</Badge>
                  )}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          {previewMemory && (
            <div className="space-y-4">
              {previewMemory.content_full && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t('longterm.detail.fullContent')}</p>
                  <div className="text-sm bg-muted/30 p-3 rounded-md whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {previewMemory.content_full}
                  </div>
                </div>
              )}
              {previewMemory.content_summary && previewMemory.current_decay_stage !== 'full' && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t('longterm.detail.summary')}</p>
                  <p className="text-sm bg-muted/30 p-3 rounded-md">{previewMemory.content_summary}</p>
                </div>
              )}
              {previewMemory.content_essence && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t('longterm.detail.essence')}</p>
                  <p className="text-sm bg-muted/30 p-3 rounded-md">{previewMemory.content_essence}</p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('longterm.detail.relevance')}</p>
                  <p className="mt-1">{Math.round((previewMemory.relevance_score ?? 0) * 100)}%</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('longterm.detail.successScore')}</p>
                  <p className="mt-1">
                    {previewMemory.success_score !== null ? `${Math.round(previewMemory.success_score * 100)}%` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('longterm.detail.reinforcements')}</p>
                  <p className="mt-1">{previewMemory.reinforcement_count}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('longterm.detail.tokens')}</p>
                  <p className="mt-1">{previewMemory.current_token_count}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('longterm.detail.accessCount')}</p>
                  <p className="mt-1">{previewMemory.access_count}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('longterm.detail.created')}</p>
                  <p className="mt-1">{new Date(previewMemory.created_at).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('longterm.detail.lastAccessed')}</p>
                  <p className="mt-1">
                    {previewMemory.last_accessed_at
                      ? new Date(previewMemory.last_accessed_at).toLocaleDateString()
                      : '—'}
                  </p>
                </div>
              </div>
              {previewMemory.tags && previewMemory.tags.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t('longterm.detail.tags')}</p>
                  <div className="flex flex-wrap gap-1">
                    {previewMemory.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('longterm.deleteDialog.title')}</DialogTitle>
            <DialogDescription>{t('longterm.deleteDialog.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('longterm.deleteDialog.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('longterm.deleteDialog.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
