'use client';

import { Library, TrendingUp, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { type TimePeriod } from '@/app/actions/analytics';
import { MetricCard } from '@/components/analytics/metric-card';
import { ActivityChart } from '@/components/analytics/activity-chart';
import { ActivityHeatmap } from '@/components/analytics/activity-heatmap';
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

  if (error || !data?.success) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('errors.loadFailed')}</AlertDescription>
      </Alert>
    );
  }

  const metrics = data.data!;

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
          value={metrics.totalToolCalls}
          icon={Wrench}
          trend={{ value: metrics.toolCallsTrend, label: formatTrend(metrics.toolCallsTrend) }}
        />
        <MetricCard
          title={t('overview.totalDocuments')}
          value={metrics.totalDocuments}
          icon={Library}
          trend={{ value: metrics.documentsTrend, label: formatTrend(metrics.documentsTrend) }}
        />
        <MetricCard
          title={t('overview.totalRagSearches')}
          value={metrics.totalRagSearches}
          icon={TrendingUp}
          trend={{ value: metrics.ragSearchesTrend, label: formatTrend(metrics.ragSearchesTrend) }}
        />
        <MetricCard
          title={t('overview.mostUsedServer')}
          value={metrics.mostUsedServer || 'N/A'}
        />
      </div>

      {/* Activity Timeline */}
      {metrics.dailyActivity.length > 0 && (
        <ActivityChart
          title={t('overview.activityTimeline')}
          data={metrics.dailyActivity}
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
        data={metrics.activityHeatmap}
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