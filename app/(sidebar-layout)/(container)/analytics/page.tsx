'use client';

import { BarChart3, Library, TrendingUp, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import {
  getOverviewMetrics,
  getProductivityMetrics,
  getRagAnalytics,
  getRecentToolCalls,
  getToolAnalytics,
  type TimePeriod,
} from '@/app/actions/analytics';
import { AchievementBadge } from '@/components/analytics/achievement-badge';
import { ActivityChart } from '@/components/analytics/activity-chart';
import { ActivityHeatmap } from '@/components/analytics/activity-heatmap';
import { MetricCard } from '@/components/analytics/metric-card';
import { ToolCallLog } from '@/components/analytics/tool-call-log';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProfiles } from '@/hooks/use-profiles';

const periods: { value: TimePeriod; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
];

export default function AnalyticsPage() {
  const { t } = useTranslation(['analytics', 'common']);
  const { activeProfile } = useProfiles();
  const [period, setPeriod] = useState<TimePeriod>('7d');

  // Fetch analytics data
  const { data: overviewData, isLoading: overviewLoading } = useSWR(
    activeProfile?.uuid ? ['overview', activeProfile.uuid, period] : null,
    () => getOverviewMetrics(activeProfile!.uuid, period),
    { refreshInterval: 60000 } // Refresh every minute
  );

  const { data: toolData, isLoading: toolLoading } = useSWR(
    activeProfile?.uuid ? ['tools', activeProfile.uuid, period] : null,
    () => getToolAnalytics(activeProfile!.uuid, period),
    { refreshInterval: 60000 }
  );

  const { data: ragData, isLoading: ragLoading } = useSWR(
    activeProfile?.uuid ? ['rag', activeProfile.uuid, period] : null,
    () => getRagAnalytics(activeProfile!.uuid, period),
    { refreshInterval: 60000 }
  );

  const { data: productivityData, isLoading: productivityLoading } = useSWR(
    activeProfile?.uuid ? ['productivity', activeProfile.uuid, period] : null,
    () => getProductivityMetrics(activeProfile!.uuid, period),
    { refreshInterval: 60000 }
  );

  const { data: toolCallLogData, isLoading: toolCallLogLoading } = useSWR(
    activeProfile?.uuid ? ['toolCallLog', activeProfile.uuid] : null,
    () => getRecentToolCalls(activeProfile!.uuid, 50),
    { refreshInterval: 60000 }
  );

  const formatTrend = (value: number) => {
    const absValue = Math.abs(value).toFixed(1);
    if (value > 0) return t('overview.trend.up', { percent: absValue });
    if (value < 0) return t('overview.trend.down', { percent: absValue });
    return t('overview.trend.neutral');
  };

  if (!activeProfile) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <p className="text-muted-foreground">{t('errors.unauthorized')}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground mt-1">{t('description')}</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as TimePeriod)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {t(`period.${p.value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tabs.overview')}</span>
          </TabsTrigger>
          <TabsTrigger value="tools" className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tabs.tools')}</span>
          </TabsTrigger>
          <TabsTrigger value="library" className="flex items-center gap-2">
            <Library className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tabs.library')}</span>
          </TabsTrigger>
          <TabsTrigger value="productivity" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tabs.productivity')}</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {overviewLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t('loading')}</div>
          ) : overviewData?.success && overviewData.data ? (
            <>
              {/* Metric Cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title={t('overview.totalToolCalls')}
                  value={overviewData.data.totalToolCalls}
                  icon={Wrench}
                  trend={{
                    value: overviewData.data.toolCallsTrend,
                    label: formatTrend(overviewData.data.toolCallsTrend),
                  }}
                />
                <MetricCard
                  title={t('overview.totalDocuments')}
                  value={overviewData.data.totalDocuments}
                  icon={Library}
                  trend={{
                    value: overviewData.data.documentsTrend,
                    label: formatTrend(overviewData.data.documentsTrend),
                  }}
                />
                <MetricCard
                  title={t('overview.totalRagSearches')}
                  value={overviewData.data.totalRagSearches}
                  trend={{
                    value: overviewData.data.ragSearchesTrend,
                    label: formatTrend(overviewData.data.ragSearchesTrend),
                  }}
                />
                <MetricCard
                  title={t('overview.mostUsedServer')}
                  value={overviewData.data.mostUsedServer?.name.substring(0, 20) || 'N/A'}
                  description={
                    overviewData.data.mostUsedServer
                      ? `${overviewData.data.mostUsedServer.count} calls`
                      : undefined
                  }
                />
              </div>

              {/* Activity Timeline */}
              {overviewData.data.dailyActivity.length > 0 && (
                <ActivityChart
                  title={t('overview.activityTimeline')}
                  data={overviewData.data.dailyActivity}
                  type="area"
                  xAxisKey="date"
                  dataKeys={[
                    {
                      key: 'toolCalls',
                      name: t('overview.toolCallsLabel'),
                      color: '#10b981',
                    },
                    {
                      key: 'ragSearches',
                      name: t('overview.ragSearchesLabel'),
                      color: '#3b82f6',
                    },
                  ]}
                  height={300}
                />
              )}
            </>
          ) : (
            <div className="text-center py-8 text-destructive">
              {t('errors.loadFailed')}
            </div>
          )}
        </TabsContent>

        {/* Tools & Servers Tab */}
        <TabsContent value="tools" className="space-y-6">
          {toolLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t('loading')}</div>
          ) : toolData?.success && toolData.data ? (
            <>
              {/* Top Tools */}
              {toolData.data.topTools.length > 0 && (
                <ActivityChart
                  title={t('tools.topTools')}
                  data={toolData.data.topTools}
                  type="bar"
                  xAxisKey="name"
                  dataKeys={[
                    { key: 'count', name: t('tools.callCount'), color: '#10b981' },
                  ]}
                  height={300}
                />
              )}

              {/* Server Activity */}
              {toolData.data.serverActivity.length > 0 && (
                <ActivityChart
                  title={t('tools.serverActivity')}
                  data={toolData.data.serverActivity}
                  type="bar"
                  xAxisKey="serverName"
                  dataKeys={[
                    { key: 'toolCalls', name: t('tools.toolCalls'), color: '#10b981' },
                    { key: 'resourceReads', name: t('tools.resourceReads'), color: '#3b82f6' },
                    { key: 'promptGets', name: t('tools.promptGets'), color: '#f59e0b' },
                  ]}
                  height={300}
                />
              )}

              {/* Hourly Distribution */}
              {toolData.data.hourlyDistribution.length > 0 && (
                <ActivityChart
                  title={t('tools.hourlyDistribution')}
                  data={toolData.data.hourlyDistribution}
                  type="line"
                  xAxisKey="hour"
                  dataKeys={[
                    { key: 'count', name: t('tools.count'), color: '#8b5cf6' },
                  ]}
                  height={250}
                />
              )}

              {/* Activity Heatmap */}
              {toolData.data.activityHeatmap.length > 0 && (
                <ActivityHeatmap
                  title={t('tools.activityHeatmap')}
                  data={toolData.data.activityHeatmap}
                  days={90}
                />
              )}

              {/* Tool Call Log */}
              {!toolCallLogLoading && toolCallLogData?.success && toolCallLogData.data && (
                <ToolCallLog data={toolCallLogData.data} />
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {t('tools.noData')}
            </div>
          )}
        </TabsContent>

        {/* Library & RAG Tab */}
        <TabsContent value="library" className="space-y-6">
          {ragLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t('loading')}</div>
          ) : ragData?.success && ragData.data ? (
            <>
              {/* Document Stats */}
              <div className="grid gap-4 md:grid-cols-3">
                <MetricCard
                  title={t('library.totalDocuments')}
                  value={ragData.data.totalDocuments}
                />
                <MetricCard
                  title={t('library.aiGenerated')}
                  value={ragData.data.aiGeneratedCount}
                  description={`${Math.round((ragData.data.aiGeneratedCount / ragData.data.totalDocuments) * 100) || 0}% of total`}
                />
                <MetricCard
                  title={t('library.uploaded')}
                  value={ragData.data.uploadedCount}
                  description={`${Math.round((ragData.data.uploadedCount / ragData.data.totalDocuments) * 100) || 0}% of total`}
                />
              </div>

              {/* Documents by Model */}
              {ragData.data.documentsByModel.length > 0 && (
                <ActivityChart
                  title={t('library.documentsByModel')}
                  data={ragData.data.documentsByModel}
                  type="bar"
                  xAxisKey="model"
                  dataKeys={[
                    { key: 'count', name: t('library.totalDocuments'), color: '#8b5cf6' },
                  ]}
                  height={250}
                />
              )}

              {/* RAG Search Frequency */}
              {ragData.data.ragSearchFrequency.length > 0 && (
                <ActivityChart
                  title={t('library.ragSearchFrequency')}
                  data={ragData.data.ragSearchFrequency}
                  type="area"
                  xAxisKey="date"
                  dataKeys={[
                    { key: 'count', name: t('library.searches'), color: '#3b82f6' },
                  ]}
                  height={250}
                />
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {t('library.noDocuments')}
            </div>
          )}
        </TabsContent>

        {/* Productivity Tab */}
        <TabsContent value="productivity" className="space-y-6">
          {productivityLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t('loading')}</div>
          ) : productivityData?.success && productivityData.data ? (
            <>
              {/* Productivity Metrics */}
              <div className="grid gap-4 md:grid-cols-4">
                <MetricCard
                  title={t('productivity.activeStreak')}
                  value={`${productivityData.data.activeStreak}`}
                  description={t('productivity.streakDays', {
                    count: productivityData.data.activeStreak,
                  })}
                />
                <MetricCard
                  title={t('productivity.mostProductiveHour')}
                  value={`${productivityData.data.mostProductiveHour}:00`}
                />
                <MetricCard
                  title={t('productivity.mostProductiveDay')}
                  value={productivityData.data.mostProductiveDay}
                />
                <MetricCard
                  title={t('productivity.avgToolCallsPerDay')}
                  value={productivityData.data.avgToolCallsPerDay}
                />
              </div>

              {/* Achievements */}
              {productivityData.data.achievements.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">
                    {t('productivity.achievements')}
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {productivityData.data.achievements.map((achievement: {
                      id: string;
                      title: string;
                      description: string;
                      achieved: boolean;
                      progress?: number;
                    }) => (
                      <AchievementBadge
                        key={achievement.id}
                        title={achievement.title}
                        description={achievement.description}
                        achieved={achievement.achieved}
                        progress={achievement.progress}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {t('errors.loadFailed')}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}