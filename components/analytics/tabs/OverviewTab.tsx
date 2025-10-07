'use client';

import { Library, TrendingUp, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { type TimePeriod } from '@/app/actions/analytics';
import { ActivityChart } from '@/components/analytics/activity-chart';
import { ActivityHeatmap } from '@/components/analytics/activity-heatmap';
import { MetricCard } from '@/components/analytics/metric-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useOverviewMetrics } from '@/hooks/use-analytics';

interface OverviewTabProps {
  profileUuid: string;
  period: TimePeriod;
}

export function OverviewTab({ profileUuid, period }: OverviewTabProps) {
  const { t } = useTranslation('analytics');
  const { data, isLoading, error } = useOverviewMetrics(profileUuid, period);

  if (isLoading) {
    return <OverviewTabSkeleton />;
  }

  if (error || !data?.success || !data?.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('errors.loadFailed')}</AlertDescription>
      </Alert>
    );
  }

  const metrics = data.data;

  // Ensure all required fields exist with defaults
  const safeMetrics = {
    totalToolCalls: metrics.totalToolCalls || 0,
    totalDocuments: metrics.totalDocuments || 0,
    totalRagSearches: metrics.totalRagSearches || 0,
    mostUsedServer: metrics.mostUsedServer || null,
    storageUsed: metrics.storageUsed || 0,
    toolCallsTrend: metrics.toolCallsTrend || 0,
    documentsTrend: metrics.documentsTrend || 0,
    ragSearchesTrend: metrics.ragSearchesTrend || 0,
    dailyActivity: metrics.dailyActivity || [],
    activityHeatmap: metrics.activityHeatmap || [],
  };

  const formatTrend = (value: number) => {
    if (value === 0) return t('overview.trend.neutral');
    return value > 0
      ? t('overview.trend.up', { percent: Math.abs(value) })
      : t('overview.trend.down', { percent: Math.abs(value) });
  };

  return (
    <>
      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title={t('overview.totalToolCalls')}
          value={safeMetrics.totalToolCalls}
          icon={Wrench}
          trend={{ value: safeMetrics.toolCallsTrend, label: formatTrend(safeMetrics.toolCallsTrend) }}
        />
        <MetricCard
          title={t('overview.totalDocuments')}
          value={safeMetrics.totalDocuments}
          icon={Library}
          trend={{ value: safeMetrics.documentsTrend, label: formatTrend(safeMetrics.documentsTrend) }}
        />
        <MetricCard
          title={t('overview.totalRagSearches')}
          value={safeMetrics.totalRagSearches}
          icon={TrendingUp}
          trend={{ value: safeMetrics.ragSearchesTrend, label: formatTrend(safeMetrics.ragSearchesTrend) }}
        />
        <MetricCard
          title={t('overview.mostUsedServer')}
          value={safeMetrics.mostUsedServer || 'N/A'}
        />
      </div>

      {/* Activity Timeline */}
      {safeMetrics.dailyActivity.length > 0 && (
        <ActivityChart
          title={t('overview.activityTimeline')}
          data={safeMetrics.dailyActivity}
          xAxisKey="date"
          dataKeys={[
            { key: 'toolCalls', name: t('overview.toolCallsLabel'), color: 'hsl(var(--primary))' },
            { key: 'ragSearches', name: t('overview.ragSearchesLabel'), color: 'hsl(var(--secondary))' },
          ]}
        />
      )}

      {/* Activity Heatmap */}
      <ActivityHeatmap
        title={t('tools.activityHeatmap')}
        data={safeMetrics.activityHeatmap}
        days={90}
      />
    </>
  );
}

function OverviewTabSkeleton() {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-48" />
    </>
  );
}