'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';

interface ToolCallLogEntry {
  id: number;
  timestamp: Date;
  action: string;
  tool_name: string | null;
  server_name: string | null;
  server_uuid: string | null;
  external_id: string | null;
}

interface ToolCallLogProps {
  data: ToolCallLogEntry[];
}

export function ToolCallLog({ data }: ToolCallLogProps) {
  const { t } = useTranslation(['analytics', 'common']);
  const [searchQuery, setSearchQuery] = useState('');

  // Format timestamp to relative time
  const formatRelativeTime = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(timestamp).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return t('analytics:toolCallLog.timeAgo.days', { count: days });
    if (hours > 0) return t('analytics:toolCallLog.timeAgo.hours', { count: hours });
    if (minutes > 0) return t('analytics:toolCallLog.timeAgo.minutes', { count: minutes });
    return t('analytics:toolCallLog.timeAgo.seconds', { count: seconds });
  };

  // Filter data based on search query
  const filteredData = useMemo(() => {
    if (!searchQuery) return data;

    const query = searchQuery.toLowerCase();
    return data.filter(
      (entry) =>
        entry.tool_name?.toLowerCase().includes(query) ||
        entry.server_name?.toLowerCase().includes(query)
    );
  }, [data, searchQuery]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('analytics:toolCallLog.title')}</CardTitle>
        <CardDescription>{t('analytics:toolCallLog.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Search Input */}
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('analytics:toolCallLog.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        <div className="rounded-md border max-h-[500px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">
                  {t('analytics:toolCallLog.columns.timestamp')}
                </TableHead>
                <TableHead>{t('analytics:toolCallLog.columns.toolName')}</TableHead>
                <TableHead>{t('analytics:toolCallLog.columns.serverName')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    {searchQuery
                      ? t('analytics:toolCallLog.noResults')
                      : t('analytics:toolCallLog.noData')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-xs">
                      {formatRelativeTime(entry.timestamp)}
                    </TableCell>
                    <TableCell>
                      {entry.tool_name ? (
                        <Badge variant="outline" className="font-mono text-xs">
                          {entry.tool_name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {t('common:notAvailable')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {entry.server_name ? (
                        <span className="text-sm">{entry.server_name}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {t('common:notAvailable')}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Results count */}
        {filteredData.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {t('analytics:toolCallLog.resultsCount', { count: filteredData.length })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}