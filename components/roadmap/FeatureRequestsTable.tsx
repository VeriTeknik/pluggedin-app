'use client';

import { formatDistanceToNow } from 'date-fns';
import { Filter } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { deleteFeatureRequest, getFeatureRequests } from '@/app/actions/roadmap';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FeatureRequestCategory, FeatureRequestStatus, VoteType } from '@/db/schema';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

import { UpdateFeatureStatusDialog } from './UpdateFeatureStatusDialog';
import { VoteButton } from './VoteButton';

interface FeatureRequestsTableProps {
  onRefresh?: number;
  profileUuid?: string;
  isAdmin?: boolean;
}

export function FeatureRequestsTable({
  onRefresh,
  profileUuid,
  isAdmin = false,
}: FeatureRequestsTableProps) {
  const { t } = useTranslation('roadmap');
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [features, setFeatures] = useState<any[]>([]);
  const [currentUserVotes, setCurrentUserVotes] = useState<
    Record<string, { vote: VoteType; weight: number }>
  >({});
  const [filters, setFilters] = useState({
    status: undefined as FeatureRequestStatus | undefined,
    category: undefined as FeatureRequestCategory | undefined,
    sortBy: 'trending' as 'trending' | 'recent' | 'controversial' | 'top',
  });
  const [editingFeature, setEditingFeature] = useState<{
    uuid: string;
    title: string;
    status: FeatureRequestStatus;
  } | null>(null);

  const loadFeatures = async () => {
    setIsLoading(true);
    try {
      const result = await getFeatureRequests(filters);
      if (result.success && result.data) {
        setFeatures(result.data);
        setCurrentUserVotes(result.currentUserVotes || {});
      }
    } catch (error) {
      console.error('Error loading features:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFeatures();
  }, [onRefresh, filters, profileUuid]);

  const getStatusColor = (status: FeatureRequestStatus) => {
    switch (status) {
      case FeatureRequestStatus.PENDING:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case FeatureRequestStatus.ACCEPTED:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case FeatureRequestStatus.IN_PROGRESS:
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      case FeatureRequestStatus.COMPLETED:
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case FeatureRequestStatus.DECLINED:
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="h-4 w-4 text-muted-foreground" />

        <Select
          value={filters.sortBy}
          onValueChange={(value: any) => setFilters({ ...filters, sortBy: value })}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="trending">{t('sortOptions.trending')}</SelectItem>
            <SelectItem value="recent">{t('sortOptions.recent')}</SelectItem>
            <SelectItem value="top">{t('sortOptions.top')}</SelectItem>
            <SelectItem value="controversial">{t('sortOptions.controversial')}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.status || 'all'}
          onValueChange={(value) =>
            setFilters({
              ...filters,
              status: value === 'all' ? undefined : (value as FeatureRequestStatus),
            })
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t('filters.status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.all')}</SelectItem>
            {Object.values(FeatureRequestStatus).map((status) => (
              <SelectItem key={status} value={status}>
                {t(`status.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.category || 'all'}
          onValueChange={(value) =>
            setFilters({
              ...filters,
              category: value === 'all' ? undefined : (value as FeatureRequestCategory),
            })
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('filters.category')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.all')}</SelectItem>
            {Object.values(FeatureRequestCategory).map((category) => (
              <SelectItem key={category} value={category}>
                {t(`categories.${category}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {features.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('table.noFeatures')}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t('table.noFeaturesDescription')}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">{t('table.feature')}</TableHead>
                <TableHead>{t('table.status')}</TableHead>
                <TableHead>{t('table.category')}</TableHead>
                <TableHead className="text-right">{t('table.votes')}</TableHead>
                <TableHead className="text-right">{t('table.action')}</TableHead>
                {isAdmin && <TableHead className="text-right">{t('table.manage')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {features.map((feature) => (
                <TableRow key={feature.uuid}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{feature.title}</p>
                      {feature.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                          {feature.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('table.createdBy')}{' '}
                        {feature.createdBy?.displayName || t('table.anonymousUser')} •{' '}
                        {formatDistanceToNow(new Date(feature.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-xs', getStatusColor(feature.status))}>
                      {t(`status.${feature.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {t(`categories.${feature.category}`)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-sm font-medium text-green-600 dark:text-green-400">
                        ✓ {feature.votes_yes_weight}
                      </span>
                      <span className="text-sm font-medium text-red-600 dark:text-red-400">
                        ✗ {feature.votes_no_weight}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({feature.votes_yes_count + feature.votes_no_count} votes)
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <VoteButton
                      featureRequestUuid={feature.uuid}
                      currentVote={currentUserVotes[feature.uuid]}
                      onVoteSuccess={loadFeatures}
                      profileUuid={profileUuid}
                    />
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingFeature({
                              uuid: feature.uuid,
                              title: feature.title,
                              status: feature.status,
                            });
                          }}
                        >
                          {t('admin.updateStatusButton')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={async () => {
                            // Add confirmation dialog before deletion
                            if (!window.confirm(t('admin.confirmDelete'))) {
                              return;
                            }

                            try {
                              const result = await deleteFeatureRequest({ featureRequestUuid: feature.uuid });
                              if (result.success) {
                                toast({
                                  title: t('admin.featureDeleted'),
                                });
                                loadFeatures();
                              } else {
                                toast({
                                  title: t('errors.updateFailed'),
                                  description: result.error,
                                  variant: 'destructive',
                                });
                              }
                            } catch (err) {
                              console.error('Error deleting feature request:', err);
                              toast({
                                title: t('errors.updateFailed'),
                                description: t('errors.loadFailed'),
                                variant: 'destructive',
                              });
                            }
                          }}
                        >
                          {t('table.delete')}
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Update Status Dialog */}
      {editingFeature && (
        <UpdateFeatureStatusDialog
          open={!!editingFeature}
          onOpenChange={(open) => !open && setEditingFeature(null)}
          featureRequestUuid={editingFeature.uuid}
          currentStatus={editingFeature.status}
          featureTitle={editingFeature.title}
          onStatusUpdated={loadFeatures}
        />
      )}
    </div>
  );
}
