'use client';

import { Activity,Package, TrendingUp, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { McpServerSource } from '@/db/schema';

interface TrendingServer {
  id: string;
  name: string;
  description: string;
  source: McpServerSource;
  category?: string;
  tags?: string[];
  trending_score: number;
  install_count: number;
  tool_call_count: number;
  total_activity_count: number;
  last_activity: string;
  github_url?: string;
  package_name?: string;
  package_registry?: string;
  shared_by?: string;
  shared_by_profile_url?: string;
}

interface TrendingResponse {
  servers: TrendingServer[];
  period: {
    label: string;
    hours: number;
  };
}

export function TrendingServers() {
  const { t } = useTranslation();
  const router = useRouter();
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('7d');
  const [sortBy, setSortBy] = useState<'installs' | 'calls'>('installs');

  const { data, error, isLoading } = useSWR(
    `/api/trending/servers?source=all&period=${period}&limit=10`,
    async (url: string): Promise<TrendingResponse> => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch trending servers');
      return res.json();
    }
  );

  const handleServerClick = (server: TrendingServer) => {
    // Navigate to search with the server name
    router.push(`/search?query=${encodeURIComponent(server.name)}&source=${server.source}`);
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {t('search.trending.title', 'Trending Servers')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t('search.trending.error', 'Failed to load trending servers')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <div className="space-y-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 shrink-0" />
            <span className="truncate">{t('search.trending.title', 'Trending Servers')}</span>
          </CardTitle>
          
          {data?.period.label && (
            <CardDescription className="text-sm">
              {t('search.trending.description', {
                period: data.period.label,
                defaultValue: `Most active servers in ${data.period.label}`,
              })}
            </CardDescription>
          )}
          
          <div className="flex flex-col gap-2">
            <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <TabsList className="h-8 w-full">
                <TabsTrigger value="24h" className="text-xs flex-1">
                  {t('search.trending.period.24h', '24h')}
                </TabsTrigger>
                <TabsTrigger value="7d" className="text-xs flex-1">
                  {t('search.trending.period.7d', '7d')}
                </TabsTrigger>
                <TabsTrigger value="30d" className="text-xs flex-1">
                  {t('search.trending.period.30d', '30d')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <TabsList className="h-8 w-full">
                <TabsTrigger value="installs" className="text-xs flex-1">
                  {t('search.trending.sortBy.installs', 'Installs')}
                </TabsTrigger>
                <TabsTrigger value="calls" className="text-xs flex-1">
                  {t('search.trending.sortBy.calls', 'Calls')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-3">
                <Skeleton className="h-10 w-10 rounded shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : data?.servers && data.servers.length > 0 ? (
          <div className="space-y-3">
            {data.servers
              .sort((a: TrendingServer, b: TrendingServer) => {
                if (sortBy === 'installs') {
                  return b.install_count - a.install_count;
                } else {
                  return b.tool_call_count - a.tool_call_count;
                }
              })
              .map((server: TrendingServer, index: number) => (
              <div
                key={server.id}
                className="flex items-start space-x-3 p-3 rounded-lg hover:bg-accent cursor-pointer transition-colors min-w-0"
                onClick={() => handleServerClick(server)}
              >
                <div className="flex-shrink-0 w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-sm font-medium">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h4 className="font-medium text-sm truncate min-w-0">{server.name}</h4>
                    <div className="flex gap-1 flex-wrap">
                      <Badge variant="outline" className="text-xs shrink-0">
                        {server.source === McpServerSource.REGISTRY ? (
                          <Package className="h-3 w-3 mr-1" />
                        ) : (
                          <Users className="h-3 w-3 mr-1" />
                        )}
                        {server.source}
                      </Badge>
                      {server.category && (
                        <Badge variant="secondary" className="text-xs shrink-0 max-w-[100px]">
                          <span className="truncate">
                            {t(`search.categories.${server.category}`, server.category)}
                          </span>
                        </Badge>
                      )}
                    </div>
                  </div>
                  {server.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1 break-words">
                      {server.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1 shrink-0">
                      <Activity className="h-3 w-3" />
                      <span className="truncate">{server.install_count} {t('search.trending.installs', 'installs')}</span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <TrendingUp className="h-3 w-3" />
                      <span className="truncate">{server.tool_call_count} {t('search.trending.toolCalls', 'tool calls')}</span>
                    </span>
                    {server.shared_by && (
                      <span className="flex items-center gap-1 shrink-0 max-w-[120px]">
                        <Users className="h-3 w-3" />
                        <span className="truncate">
                          {t('search.trending.sharedBy', { user: server.shared_by })}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            {t('search.trending.noData', 'No trending servers found for this period')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}