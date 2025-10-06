'use client';

import { useTranslation } from 'react-i18next';

import { type TimePeriod } from '@/app/actions/analytics';
import { ActivityChart } from '@/components/analytics/activity-chart';
import { ActivityHeatmap } from '@/components/analytics/activity-heatmap';
import { ToolCallLog } from '@/components/analytics/tool-call-log';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useToolCallLog,useToolMetrics } from '@/hooks/use-analytics';

interface ToolsTabProps {
  profileUuid: string;
  period: TimePeriod;
}

export function ToolsTab({ profileUuid, period }: ToolsTabProps) {
  const { t } = useTranslation('analytics');
  const { data: toolData, isLoading: toolLoading, error: toolError } = useToolMetrics(profileUuid, period);
  const { data: logData, isLoading: logLoading } = useToolCallLog(profileUuid);

  if (toolLoading) {
    return <ToolsTabSkeleton />;
  }

  if (toolError || !toolData?.success || !toolData?.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('errors.loadFailed')}</AlertDescription>
      </Alert>
    );
  }

  const metrics = toolData.data;

  // Ensure all required fields exist with defaults
  const safeMetrics = {
    topTools: metrics.topTools || [],
    serverActivity: metrics.serverActivity || [],
    hourlyDistribution: metrics.hourlyDistribution || [],
    activityHeatmap: metrics.activityHeatmap || [],
  };

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top Tools */}
        <Card>
          <CardHeader>
            <CardTitle>{t('tools.topTools')}</CardTitle>
            <CardDescription>{t('tools.toolName')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {safeMetrics.topTools.map((tool: any, index: number) => (
              <div key={index} className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{tool.name}</p>
                  <p className="text-sm text-muted-foreground">{tool.serverName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{tool.count}</span>
                  <Progress value={tool.successRate} className="w-16 h-2" />
                </div>
              </div>
            ))}
            {safeMetrics.topTools.length === 0 && (
              <p className="text-muted-foreground">{t('tools.noData')}</p>
            )}
          </CardContent>
        </Card>

        {/* Server Activity */}
        <Card>
          <CardHeader>
            <CardTitle>{t('tools.serverActivity')}</CardTitle>
            <CardDescription>{t('tools.totalActivity')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {safeMetrics.serverActivity.map((server: any, index: number) => (
              <div key={index} className="space-y-1">
                <p className="font-medium">{server.serverName}</p>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span>{t('tools.toolCalls')}: {server.toolCalls}</span>
                  <span>{t('tools.resourceReads')}: {server.resourceReads}</span>
                  <span>{t('tools.promptGets')}: {server.promptGets}</span>
                </div>
              </div>
            ))}
            {safeMetrics.serverActivity.length === 0 && (
              <p className="text-muted-foreground">{t('tools.noData')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Hourly Distribution */}
      {safeMetrics.hourlyDistribution.length > 0 && (
        <ActivityChart
          title={t('tools.hourlyDistribution')}
          data={safeMetrics.hourlyDistribution.map((h: any) => ({
            date: `${h.hour}:00`,
            count: h.count,
          }))}
          xAxisKey="date"
          dataKeys={[
            { key: 'count', name: t('tools.count'), color: 'hsl(var(--primary))' },
          ]}
        />
      )}

      {/* Activity Heatmap */}
      <ActivityHeatmap
        title={t('tools.activityHeatmap')}
        data={safeMetrics.activityHeatmap}
        days={90}
      />

      {/* Tool Call Log */}
      {!logLoading && logData?.success && logData.data && (
        <ToolCallLog data={logData.data} />
      )}
    </>
  );
}

function ToolsTabSkeleton() {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-48" />
      <Skeleton className="h-64" />
    </>
  );
}