'use client';

import { formatDistanceToNow } from 'date-fns';
import { Activity, ChevronRight, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import type { ToolCallLogEntry } from '@/app/actions/analytics';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface RecentToolCallsProps {
  toolCalls: ToolCallLogEntry[] | undefined;
  isLoading: boolean;
  onToolClick?: () => void;
}

export function RecentToolCalls({ toolCalls, isLoading, onToolClick }: RecentToolCallsProps) {
  const { t } = useTranslation('analytics');

  const handleToolClick = () => {
    if (onToolClick) {
      onToolClick();
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {t('dashboard.recentActivity')}
          </CardTitle>
          <CardDescription>{t('dashboard.recentActivityDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-14" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const hasToolCalls = toolCalls && toolCalls.length > 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              {t('dashboard.recentActivity')}
            </CardTitle>
            <CardDescription>{t('dashboard.recentActivityDescription')}</CardDescription>
          </div>
          {hasToolCalls && (
            <Link href="/analytics?tab=tools">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                {t('dashboard.viewAll')}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!hasToolCalls ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Wrench className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">
              {t('dashboard.emptyTools.title')}
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              {t('dashboard.emptyTools.description')}
            </p>
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <Link href="/mcp-servers">
                <Button className="w-full" size="sm">
                  <Wrench className="h-4 w-4 mr-2" />
                  {t('dashboard.emptyTools.configureAction')}
                </Button>
              </Link>
              <Link href="/setup-guide">
                <Button variant="outline" className="w-full" size="sm">
                  {t('dashboard.emptyTools.setupAction')}
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {toolCalls.slice(0, 10).map((call) => (
              <Link
                key={call.id}
                href="/analytics?tab=tools"
                onClick={handleToolClick}
              >
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Wrench className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {call.tool_name || 'Unknown tool'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {call.server_name ? (
                          <Badge variant="outline" className="text-xs">
                            {call.server_name}
                          </Badge>
                        ) : call.external_id ? (
                          <Badge variant="outline" className="text-xs">
                            {call.external_id}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            Unknown server
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(call.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}