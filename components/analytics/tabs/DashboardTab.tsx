'use client';

import { Library, Search, Sparkles, TrendingUp, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type TimePeriod } from '@/app/actions/analytics';
import { ActivityChart } from '@/components/analytics/activity-chart';
import { ActivityHeatmap } from '@/components/analytics/activity-heatmap';
import { MetricCard } from '@/components/analytics/metric-card';
import { RecentDocuments } from '@/components/dashboard/RecentDocuments';
import { RecentToolCalls } from '@/components/dashboard/RecentToolCalls';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useOverviewMetrics, useRecentDocuments, useRecentToolCalls } from '@/hooks/use-analytics';
import { useKnowledgeBaseSearch } from '@/hooks/use-knowledge-base-search';

// Import the AiSearchAnswer component from library
const AiSearchAnswer = dynamic(
  () => import('@/app/(sidebar-layout)/(container)/library/components/AiSearchAnswer')
    .then(mod => ({ default: mod.AiSearchAnswer })),
  { ssr: false }
);

import dynamic from 'next/dynamic';

// Define proper types for recent documents and tool calls
interface RecentDocument {
  uuid: string;
  name: string;
  description?: string;
  tags?: string[] | string; // Can be array or comma-separated string
  created_at: string;
  size?: number;
  source?: string;
}

interface RecentToolCall {
  id: string;
  tool_name: string;
  server_name: string;
  arguments?: string;
  created_at: string;
  status?: string;
  duration?: number;
}

interface DashboardTabProps {
  profileUuid: string;
  projectUuid: string;
  period: TimePeriod;
}

export function DashboardTab({ profileUuid, projectUuid, period }: DashboardTabProps) {
  const { t } = useTranslation('analytics');
  const router = useRouter();

  // Dashboard metrics
  const { data, isLoading, error } = useOverviewMetrics(profileUuid, period, projectUuid);
  const { data: recentDocs, isLoading: docsLoading } = useRecentDocuments(profileUuid, 10, projectUuid);
  const { data: recentCalls, isLoading: callsLoading } = useRecentToolCalls(profileUuid);

  // AI Search state
  const [aiSearchEnabled, setAiSearchEnabled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const {
    answer: aiAnswer,
    sources: aiSources,
    documentIds: aiDocumentIds,
    documents: aiDocuments,
    isLoading: isAiLoading,
    error: aiError,
    setQuery: setAiQuery,
    clearAnswer: clearAiAnswer,
  } = useKnowledgeBaseSearch();

  // Handle search input
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (aiSearchEnabled) {
      setAiQuery(value);
    }
    // When AI search is disabled, the search will filter the displayed data
  }, [aiSearchEnabled, setAiQuery]);

  // Handle AI search toggle
  const handleAiSearchToggle = useCallback((enabled: boolean) => {
    setAiSearchEnabled(enabled);
    if (!enabled) {
      setSearchQuery('');
      clearAiAnswer();
    }
  }, [clearAiAnswer]);

  // Handle document click - navigate to library with document selected
  const handleDocumentClick = useCallback((documentId: string) => {
    router.push(`/library?doc=${documentId}`);
  }, [router]);

  // Handle tool click - navigate to tools tab
  const handleToolClick = useCallback(() => {
    router.push('/analytics?tab=tools');
  }, [router]);

  // Memoize metrics with defaults - must be called before conditional returns
  const metrics = data?.data;
  const safeMetrics = useMemo(() => ({
    totalToolCalls: metrics?.totalToolCalls || 0,
    totalDocuments: metrics?.totalDocuments || 0,
    totalRagSearches: metrics?.totalRagSearches || 0,
    mostUsedServer: metrics?.mostUsedServer || null,
    storageUsed: metrics?.storageUsed || 0,
    toolCallsTrend: metrics?.toolCallsTrend || 0,
    documentsTrend: metrics?.documentsTrend || 0,
    ragSearchesTrend: metrics?.ragSearchesTrend || 0,
    dailyActivity: metrics?.dailyActivity || [],
    activityHeatmap: metrics?.activityHeatmap || [],
  }), [metrics]);

  // Helper function to sanitize search query
  const sanitizeSearchQuery = (query: string): string => {
    // Basic sanitization - remove special characters that could cause issues
    return query.replace(/[<>\"']/g, '').substring(0, 200);
  };

  // Filter recent documents and tool calls based on search query when AI search is disabled
  const filteredRecentDocs = useMemo(() => {
    if (!recentDocs?.data || aiSearchEnabled || !searchQuery) {
      return recentDocs?.data || [];
    }

    const query = sanitizeSearchQuery(searchQuery).toLowerCase();
    return (recentDocs.data as RecentDocument[]).filter((doc) => {
      // Check name
      const matchesName = doc.name?.toLowerCase().includes(query);

      // Check description
      const matchesDescription = doc.description?.toLowerCase().includes(query);

      // Check tags - handle both array and string formats
      let matchesTags = false;
      if (doc.tags) {
        if (Array.isArray(doc.tags)) {
          matchesTags = doc.tags.some(tag => tag.toLowerCase().includes(query));
        } else if (typeof doc.tags === 'string') {
          matchesTags = doc.tags.toLowerCase().includes(query);
        }
      }

      return matchesName || matchesDescription || matchesTags;
    });
  }, [recentDocs?.data, searchQuery, aiSearchEnabled]);

  const filteredRecentCalls = useMemo(() => {
    if (!recentCalls?.data || aiSearchEnabled || !searchQuery) {
      return recentCalls?.data || [];
    }

    const query = sanitizeSearchQuery(searchQuery).toLowerCase();
    return (recentCalls.data as RecentToolCall[]).filter((call) =>
      call.tool_name?.toLowerCase().includes(query) ||
      call.server_name?.toLowerCase().includes(query) ||
      call.arguments?.toLowerCase().includes(query)
    );
  }, [recentCalls?.data, searchQuery, aiSearchEnabled]);

  const formatTrend = useCallback((value: number) => {
    if (value === 0) return t('overview.trend.neutral');
    return value > 0
      ? t('overview.trend.up', { percent: Math.abs(value) })
      : t('overview.trend.down', { percent: Math.abs(value) });
  }, [t]);

  if (isLoading) {
    return <DashboardTabSkeleton />;
  }

  if (error || !data?.success || !data?.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('errors.loadFailed')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      {/* AI Search Bar */}
      <div className="mb-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            {aiSearchEnabled ? (
              <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            ) : (
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            )}
            <Input
              placeholder={aiSearchEnabled
                ? t('dashboard.aiSearchPlaceholder', 'Ask a question about your documents...')
                : t('dashboard.searchPlaceholder', 'Search your knowledge base...')}
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 h-12 text-base"
              aria-label={aiSearchEnabled
                ? t('dashboard.aiSearchPlaceholder')
                : t('dashboard.searchPlaceholder')}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="ai-search"
              checked={aiSearchEnabled}
              onCheckedChange={handleAiSearchToggle}
            />
            <Label htmlFor="ai-search" className="flex items-center gap-1 cursor-pointer">
              <Sparkles className="h-4 w-4" />
              <span>{t('dashboard.aiSearch', 'AI Search')}</span>
            </Label>
          </div>
        </div>
      </div>

      {/* AI Search Results */}
      {aiSearchEnabled && searchQuery && (
        <AiSearchAnswer
          answer={aiAnswer}
          sources={aiSources}
          documentIds={aiDocumentIds}
          documents={aiDocuments}
          isLoading={isAiLoading}
          error={aiError}
          query={searchQuery}
          onDocumentClick={handleDocumentClick}
        />
      )}

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

      {/* Recent Documents and Tool Calls */}
      <div className="grid gap-4 md:grid-cols-2">
        <RecentDocuments
          documents={filteredRecentDocs}
          isLoading={docsLoading}
          onDocumentClick={handleDocumentClick}
        />
        <RecentToolCalls
          toolCalls={filteredRecentCalls}
          isLoading={callsLoading}
          onToolClick={handleToolClick}
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

function DashboardTabSkeleton() {
  return (
    <>
      <Skeleton className="h-12 mb-6" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-48" />
    </>
  );
}