'use client';

import {
  Brain,
  CheckCircle2,
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
import { Input } from '@/components/ui/input';

import { useMemoryRing } from '../hooks/useMemoryRing';
import { useMemorySearch } from '../hooks/useMemorySearch';

interface ProceduresTabProps {
  onRefresh?: () => void;
}

interface ProcedureEntry {
  uuid: string;
  content_summary: string | null;
  content_essence: string | null;
  content_full: string | null;
  current_decay_stage: string;
  current_token_count: number;
  access_count: number;
  relevance_score: number;
  success_score: number | null;
  reinforcement_count: number;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export function ProceduresTab({ onRefresh }: ProceduresTabProps) {
  const { t } = useTranslation('memory');
  const { memories, isLoading, removeMemory } = useMemoryRing({ ringType: 'procedures' });
  const { results: searchResults, isSearching, search, clear } = useMemorySearch();
  const [searchQuery, setSearchQuery] = useState('');
  const [previewProc, setPreviewProc] = useState<ProcedureEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProcedureEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const typedProcedures = memories as unknown as ProcedureEntry[];
  const displayProcedures = searchQuery && searchResults.length > 0
    ? searchResults as unknown as ProcedureEntry[]
    : typedProcedures;

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      clear();
      return;
    }
    await search({
      query: searchQuery,
      ringTypes: ['procedures'],
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

  const getDecayColor = (stage: string) => {
    switch (stage) {
      case 'full': return 'bg-green-500/10 text-green-600';
      case 'compressed': return 'bg-yellow-500/10 text-yellow-600';
      case 'summary': return 'bg-orange-500/10 text-orange-600';
      case 'essence': return 'bg-red-500/10 text-red-600';
      default: return 'bg-gray-500/10 text-gray-600';
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
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('procedures.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-10"
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleSearch} disabled={isSearching}>
          {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : t('procedures.search')}
        </Button>
      </div>

      {/* Procedures List */}
      {displayProcedures.length === 0 ? (
        <Card className="h-48 flex items-center justify-center">
          <CardContent className="text-center">
            <Brain className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <CardTitle className="text-sm mb-1">{t('procedures.empty.title')}</CardTitle>
            <CardDescription className="text-xs">{t('procedures.empty.description')}</CardDescription>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {displayProcedures.map((proc) => (
            <Card key={proc.uuid} className="group hover:shadow-md transition-shadow">
              <CardHeader className="py-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {proc.content_summary || proc.content_essence || proc.content_full?.substring(0, 100) || '—'}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className={`text-[10px] ${getDecayColor(proc.current_decay_stage)}`}>
                        {proc.current_decay_stage}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {proc.current_token_count} tokens
                      </span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <CheckCircle2 className="h-3 w-3" />
                        {proc.reinforcement_count}x
                      </span>
                      {proc.success_score !== null && (
                        <span className="text-[10px] text-muted-foreground">
                          {Math.round(proc.success_score * 100)}% success
                        </span>
                      )}
                    </div>
                    {proc.tags && proc.tags.length > 0 && (
                      <div className="flex gap-1 mt-1.5">
                        {proc.tags.slice(0, 4).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewProc(proc)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(proc)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!previewProc} onOpenChange={() => setPreviewProc(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('procedures.detail.title')}</DialogTitle>
          </DialogHeader>
          {previewProc && (
            <div className="space-y-4">
              {previewProc.content_full && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t('procedures.detail.fullContent')}</p>
                  <div className="text-sm bg-muted/30 p-3 rounded-md whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {previewProc.content_full}
                  </div>
                </div>
              )}
              {previewProc.content_summary && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t('procedures.detail.summary')}</p>
                  <p className="text-sm bg-muted/30 p-3 rounded-md">{previewProc.content_summary}</p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('procedures.detail.relevance')}</p>
                  <p className="mt-1">{Math.round((previewProc.relevance_score ?? 0) * 100)}%</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('procedures.detail.reinforcements')}</p>
                  <p className="mt-1">{previewProc.reinforcement_count}x</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('procedures.detail.accessCount')}</p>
                  <p className="mt-1">{previewProc.access_count}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('procedures.detail.tokens')}</p>
                  <p className="mt-1">{previewProc.current_token_count}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('procedures.detail.created')}</p>
                  <p className="mt-1">{new Date(previewProc.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('procedures.deleteDialog.title')}</DialogTitle>
            <DialogDescription>{t('procedures.deleteDialog.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('procedures.deleteDialog.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('procedures.deleteDialog.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
