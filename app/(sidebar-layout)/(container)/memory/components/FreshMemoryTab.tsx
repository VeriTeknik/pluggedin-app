'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Filter,
  Loader2,
  Sparkles,
  Trash2,
  XCircle,
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

import { useMemorySessions } from '../hooks/useMemorySessions';
import { getStatusColor, getTypeColor } from '../utils';

interface FreshMemoryTabProps {
  onRefresh?: () => void;
}

interface SessionData {
  uuid: string;
  memory_session_id: string;
  content_session_id: string;
  status: string;
  observation_count: number;
  total_tokens: number;
  started_at: string;
  ended_at: string | null;
  z_report: Record<string, unknown> | null;
  agent_uuid: string | null;
}

interface ObservationData {
  uuid: string;
  observation_type: string;
  content: string;
  classified: boolean;
  classified_ring: string | null;
  classification_confidence: number | null;
  outcome: string | null;
  token_count: number;
  created_at: string;
}

const PAGE_SIZE = 20;

export function FreshMemoryTab({ onRefresh }: FreshMemoryTabProps) {
  const { t } = useTranslation('memory');
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'abandoned'>('all');
  const [pruning, setPruning] = useState(false);
  const { sessions, isLoading, refresh } = useMemorySessions({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [previewObs, setPreviewObs] = useState<ObservationData | null>(null);
  const [sessionObservations, setSessionObservations] = useState<Record<string, ObservationData[]>>({});
  const [loadingObs, setLoadingObs] = useState<string | null>(null);

  const handlePrune = async () => {
    if (!confirm(t('fresh.pruneConfirm'))) return;
    setPruning(true);
    try {
      const res = await fetch('/api/memory/sessions/prune', { method: 'POST' });
      if (res.ok) {
        refresh();
        onRefresh?.();
      }
    } catch {
      // Non-fatal
    } finally {
      setPruning(false);
    }
  };

  const toggleSession = async (sessionUuid: string) => {
    if (expandedSession === sessionUuid) {
      setExpandedSession(null);
      return;
    }

    setExpandedSession(sessionUuid);

    if (!sessionObservations[sessionUuid]) {
      setLoadingObs(sessionUuid);
      try {
        const response = await fetch(`/api/memory/sessions/${sessionUuid}/observations`);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setSessionObservations(prev => ({
              ...prev,
              [sessionUuid]: data.data || [],
            }));
          }
        }
      } catch {
        // Non-fatal
      } finally {
        setLoadingObs(null);
      }
    }
  };

  const getOutcomeIcon = (outcome: string | null) => {
    switch (outcome) {
      case 'success': return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case 'failure': return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      default: return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const typedSessions = sessions as SessionData[];

  if (typedSessions.length === 0 && statusFilter === 'all') {
    return (
      <Card className="h-64 flex items-center justify-center">
        <CardContent className="text-center">
          <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <CardTitle className="mb-2">{t('fresh.empty.title')}</CardTitle>
          <CardDescription>{t('fresh.empty.description')}</CardDescription>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(0); }}
          >
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('fresh.filter.all')}</SelectItem>
              <SelectItem value="active">{t('fresh.status.active')}</SelectItem>
              <SelectItem value="completed">{t('fresh.status.completed')}</SelectItem>
              <SelectItem value="abandoned">{t('fresh.status.abandoned')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrune}
          disabled={pruning}
          className="text-xs text-destructive hover:text-destructive"
        >
          {pruning ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
          {t('fresh.prune')}
        </Button>
      </div>

      {typedSessions.length === 0 ? (
        <Card className="h-48 flex items-center justify-center">
          <CardContent className="text-center">
            <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <CardDescription>{t('fresh.empty.description')}</CardDescription>
          </CardContent>
        </Card>
      ) : null}

      {typedSessions.map((session) => (
        <Card key={session.uuid} className="overflow-hidden">
          <CardHeader
            className="cursor-pointer hover:bg-muted/50 transition-colors py-3"
            onClick={() => toggleSession(session.uuid)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {expandedSession === session.uuid ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <div>
                  <CardTitle className="text-sm font-medium">
                    {session.content_session_id || session.memory_session_id}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    <Clock className="h-3 w-3 inline mr-1" />
                    {new Date(session.started_at).toLocaleString()}
                    {session.ended_at && (
                      <span className="ml-2">
                        — {new Date(session.ended_at).toLocaleString()}
                      </span>
                    )}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {session.observation_count} {t('fresh.observations')}
                </Badge>
                <Badge className={`text-xs ${getStatusColor(session.status)}`}>
                  {t(`fresh.status.${session.status}`)}
                </Badge>
                {session.z_report && (
                  <Badge variant="secondary" className="text-xs">
                    {t('fresh.zReport')}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          {expandedSession === session.uuid && (
            <CardContent className="pt-0">
              {/* Z-Report Summary */}
              {session.z_report && (
                <Card className="mb-3 bg-muted/30">
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs font-medium">{t('fresh.zReportSummary')}</CardTitle>
                  </CardHeader>
                  <CardContent className="py-2 px-3">
                    <p className="text-sm text-muted-foreground">
                      {(session.z_report as Record<string, unknown>).summary as string || t('fresh.noSummary')}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Observations */}
              {loadingObs === session.uuid ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : sessionObservations[session.uuid]?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">{t('fresh.table.type')}</TableHead>
                      <TableHead>{t('fresh.table.content')}</TableHead>
                      <TableHead className="w-[80px]">{t('fresh.table.outcome')}</TableHead>
                      <TableHead className="w-[100px]">{t('fresh.table.classified')}</TableHead>
                      <TableHead className="w-[60px]">{t('fresh.table.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessionObservations[session.uuid].map((obs) => (
                      <TableRow key={obs.uuid}>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${getTypeColor(obs.observation_type)}`}>
                            {obs.observation_type.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[400px] truncate text-sm">
                          {obs.content.substring(0, 120)}
                          {obs.content.length > 120 && '...'}
                        </TableCell>
                        <TableCell>
                          {getOutcomeIcon(obs.outcome)}
                        </TableCell>
                        <TableCell>
                          {obs.classified ? (
                            <Badge variant="secondary" className="text-xs">
                              {obs.classified_ring}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t('fresh.pending')}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPreviewObs(obs)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('fresh.noObservations')}
                </p>
              )}
            </CardContent>
          )}
        </Card>
      ))}

      {/* Pagination */}
      {(page > 0 || typedSessions.length === PAGE_SIZE) && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {t('fresh.pagination.prev')}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t('fresh.pagination.page', { page: page + 1 })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={typedSessions.length < PAGE_SIZE}
            onClick={() => setPage(p => p + 1)}
          >
            {t('fresh.pagination.next')}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Observation Preview Dialog */}
      <Dialog open={!!previewObs} onOpenChange={() => setPreviewObs(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('fresh.observationDetails')}</DialogTitle>
            <DialogDescription>
              {previewObs && (
                <Badge variant="outline" className={`text-xs ${getTypeColor(previewObs.observation_type)}`}>
                  {previewObs.observation_type.replace('_', ' ')}
                </Badge>
              )}
            </DialogDescription>
          </DialogHeader>
          {previewObs && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">{t('fresh.table.content')}</p>
                <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-md">
                  {previewObs.content}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('fresh.table.outcome')}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {getOutcomeIcon(previewObs.outcome)}
                    <span>{previewObs.outcome || 'neutral'}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('fresh.tokens')}</p>
                  <p className="mt-1">{previewObs.token_count}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('fresh.table.classified')}</p>
                  <p className="mt-1">
                    {previewObs.classified
                      ? `${previewObs.classified_ring} (${Math.round((previewObs.classification_confidence ?? 0) * 100)}%)`
                      : t('fresh.pending')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t('fresh.createdAt')}</p>
                  <p className="mt-1">{new Date(previewObs.created_at).toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
