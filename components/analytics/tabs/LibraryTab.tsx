'use client';

import { FileText, HardDrive } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { type TimePeriod } from '@/app/actions/analytics';
import { ActivityChart } from '@/components/analytics/activity-chart';
import { MetricCard } from '@/components/analytics/metric-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRagMetrics } from '@/hooks/use-analytics';

interface LibraryTabProps {
  profileUuid: string;
  period: TimePeriod;
}

export function LibraryTab({ profileUuid, period }: LibraryTabProps) {
  const { t } = useTranslation('analytics');
  const { data, isLoading, error } = useRagMetrics(profileUuid, period);

  if (isLoading) {
    return <LibraryTabSkeleton />;
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
    totalDocuments: metrics.totalDocuments || 0,
    aiGeneratedCount: metrics.aiGeneratedCount || 0,
    uploadedCount: metrics.uploadedCount || 0,
    storageBreakdown: metrics.storageBreakdown || { files: 0, ragVectors: 0 },
    documentsByModel: metrics.documentsByModel || [],
    ragSearchFrequency: metrics.ragSearchFrequency || [],
    mostAccessedDocs: metrics.mostAccessedDocs || [],
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <>
      {/* Document Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title={t('library.totalDocuments')}
          value={safeMetrics.totalDocuments}
          icon={FileText}
        />
        <MetricCard
          title={t('library.aiGenerated')}
          value={safeMetrics.aiGeneratedCount}
        />
        <MetricCard
          title={t('library.uploaded')}
          value={safeMetrics.uploadedCount}
        />
        <MetricCard
          title={t('library.storageBreakdown')}
          value={formatBytes(safeMetrics.storageBreakdown.files)}
          icon={HardDrive}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Documents by AI Model */}
        <Card>
          <CardHeader>
            <CardTitle>{t('library.documentsByModel')}</CardTitle>
            <CardDescription>{t('library.model')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {safeMetrics.documentsByModel.map((model: { model: string; count: number }, index: number) => (
              <div key={index} className="flex justify-between">
                <span>{model.model}</span>
                <span className="font-semibold">{model.count}</span>
              </div>
            ))}
            {safeMetrics.documentsByModel.length === 0 && (
              <p className="text-muted-foreground">{t('library.noDocuments')}</p>
            )}
          </CardContent>
        </Card>

        {/* Storage Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>{t('library.storageBreakdown')}</CardTitle>
            <CardDescription>{t('library.files')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>{t('library.files')}</span>
                <span className="font-semibold">{formatBytes(safeMetrics.storageBreakdown.files)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('library.ragVectors')}</span>
                <span className="font-semibold">{safeMetrics.storageBreakdown.ragVectors}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* RAG Search Frequency */}
      {safeMetrics.ragSearchFrequency.length > 0 && (
        <ActivityChart
          title={t('library.ragSearchFrequency')}
          data={safeMetrics.ragSearchFrequency}
          xAxisKey="date"
          dataKeys={[
            { key: 'count', name: t('library.searches'), color: 'hsl(var(--primary))' },
          ]}
        />
      )}

      {/* Most Accessed Documents */}
      <Card>
        <CardHeader>
          <CardTitle>{t('library.mostAccessedDocs')}</CardTitle>
          <CardDescription>{t('library.documentsRankedByAccess')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {safeMetrics.mostAccessedDocs.map((doc: any, index: number) => (
            <div key={index} className="flex justify-between">
              <span className="truncate">{doc.name}</span>
              <span className="font-semibold">{doc.accessCount}</span>
            </div>
          ))}
          {safeMetrics.mostAccessedDocs.length === 0 && (
            <p className="text-muted-foreground">{t('library.noDocuments')}</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function LibraryTabSkeleton() {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-64" />
    </>
  );
}