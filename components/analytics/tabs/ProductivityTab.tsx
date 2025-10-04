'use client';

import { Calendar, Clock, FileText, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { type TimePeriod } from '@/app/actions/analytics';
import { AchievementBadge } from '@/components/analytics/achievement-badge';
import { MetricCard } from '@/components/analytics/metric-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProductivityMetrics } from '@/hooks/use-analytics';

interface ProductivityTabProps {
  profileUuid: string;
  period: TimePeriod;
}

export function ProductivityTab({ profileUuid, period }: ProductivityTabProps) {
  const { t } = useTranslation('analytics');
  const { data, isLoading, error } = useProductivityMetrics(profileUuid, period);

  if (isLoading) {
    return <ProductivityTabSkeleton />;
  }

  if (error || !data?.success) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('errors.loadFailed')}</AlertDescription>
      </Alert>
    );
  }

  const metrics = data.data!;

  return (
    <>
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title={t('productivity.activeStreak')}
          value={metrics.activeStreak}
          icon={Calendar}
          description={t('productivity.streakDays', { count: metrics.activeStreak })}
        />
        <MetricCard
          title={t('productivity.mostProductiveHour')}
          value={`${metrics.mostProductiveHour}:00`}
          icon={Clock}
        />
        <MetricCard
          title={t('productivity.avgToolCallsPerDay')}
          value={metrics.avgToolCallsPerDay.toFixed(1)}
          icon={Zap}
        />
        <MetricCard
          title={t('productivity.avgDocumentsPerWeek')}
          value={metrics.avgDocumentsPerWeek.toFixed(1)}
          icon={FileText}
        />
      </div>

      {/* Tool Combinations / Workflows */}
      {metrics.toolCombinations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Common Tool Workflows</CardTitle>
            <CardDescription>Tools frequently used together</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {metrics.toolCombinations.map((combo: any, index: number) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{combo.tool1}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium">{combo.tool2}</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {combo.count} times
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Work Patterns */}
      <Card>
        <CardHeader>
          <CardTitle>{t('productivity.workPatterns')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>{t('productivity.mostProductiveDay')}</span>
              <span className="font-semibold">{metrics.mostProductiveDay}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('productivity.mostProductiveHour')}</span>
              <span className="font-semibold">{metrics.mostProductiveHour}:00</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Achievements */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{t('productivity.achievements')}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {metrics.achievements.map((achievement: any) => (
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
    </>
  );
}

function ProductivityTabSkeleton() {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-64" />
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </>
  );
}