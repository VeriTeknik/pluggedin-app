'use client';

import {
  AlertCircle,
  Loader2,
  Search,
  Star,
  ThumbsDown,
  ThumbsUp,
  Users,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

import { useCBPPatterns, type CBPPattern } from '../hooks/useCBPPatterns';

interface CollectiveTabProps {
  onRefresh?: () => void;
}

function getPatternTypeColor(type: string): string {
  const colors: Record<string, string> = {
    error_solution: 'text-red-600 border-red-200',
    error_recovery: 'text-red-600 border-red-200',
    anti_pattern: 'text-orange-600 border-orange-200',
    best_practice: 'text-green-600 border-green-200',
    gotcha: 'text-yellow-600 border-yellow-200',
    security_warning: 'text-red-700 border-red-300',
    performance_tip: 'text-blue-600 border-blue-200',
    workflow: 'text-purple-600 border-purple-200',
    tool_sequence: 'text-indigo-600 border-indigo-200',
    preference: 'text-teal-600 border-teal-200',
    migration_note: 'text-gray-600 border-gray-200',
    compatibility: 'text-cyan-600 border-cyan-200',
  };
  return colors[type] || 'text-muted-foreground';
}

export function CollectiveTab({ onRefresh }: CollectiveTabProps) {
  const { t } = useTranslation('memory');
  const [searchQuery, setSearchQuery] = useState('');
  const {
    patterns,
    stats,
    isSearching,
    isLoadingStats,
    error,
    search,
    submitFeedback,
    loadStats,
    clear,
  } = useCBPPatterns();

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      clear();
      return;
    }
    await search(searchQuery);
  };

  const handleFeedback = async (pattern: CBPPattern, positive: boolean) => {
    await submitFeedback(
      pattern.uuid,
      positive ? 5 : 1,
      positive ? 'helpful' : 'inaccurate'
    );
    onRefresh?.();
  };

  return (
    <div className="space-y-4">
      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-lg font-bold">{stats.visiblePatterns}</p>
                  <p className="text-xs text-muted-foreground">{t('collective.stats.totalPatterns')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" />
                <div>
                  <p className="text-lg font-bold">{stats.pendingPatterns}</p>
                  <p className="text-xs text-muted-foreground">{t('collective.stats.verified')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-lg font-bold">{stats.uniqueContributors}</p>
                  <p className="text-xs text-muted-foreground">{t('collective.stats.contributors')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-lg font-bold">{stats.totalContributions}</p>
                  <p className="text-xs text-muted-foreground">{t('collective.stats.contributions')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoadingStats && !stats && (
        <div className="flex items-center justify-center h-16">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('collective.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-10"
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleSearch} disabled={isSearching}>
          {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : t('collective.search')}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {patterns.length === 0 && !isSearching && searchQuery ? (
        <Card className="h-32 flex items-center justify-center">
          <CardContent className="text-center">
            <CardTitle className="text-sm mb-1">{t('collective.noResults')}</CardTitle>
            <CardDescription className="text-xs">{t('collective.noResultsDescription')}</CardDescription>
          </CardContent>
        </Card>
      ) : patterns.length === 0 && !searchQuery ? (
        <Card className="h-48 flex items-center justify-center">
          <CardContent className="text-center">
            <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <CardTitle className="text-sm mb-1">{t('collective.empty.title')}</CardTitle>
            <CardDescription className="text-xs">{t('collective.empty.description')}</CardDescription>
          </CardContent>
        </Card>
      ) : patterns.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">{t('collective.table.type')}</TableHead>
              <TableHead>{t('collective.table.pattern')}</TableHead>
              <TableHead className="w-[90px]">{t('collective.table.confidence')}</TableHead>
              <TableHead className="w-[80px]">{t('collective.table.seen')}</TableHead>
              <TableHead className="w-[80px]">{t('collective.table.rating')}</TableHead>
              <TableHead className="w-[80px]">{t('collective.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patterns.map((pattern) => (
              <TableRow key={pattern.uuid}>
                <TableCell>
                  <Badge variant="outline" className={`text-xs ${getPatternTypeColor(pattern.patternType)}`}>
                    {pattern.patternType.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[400px]">
                  <p className="text-sm">{pattern.pattern || pattern.description}</p>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${Math.round(pattern.confidence * 40)}px` }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {Math.round(pattern.confidence * 100)}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-center">
                  {pattern.occurrenceCount}x
                </TableCell>
                <TableCell className="text-xs">
                  {pattern.averageRating !== null ? (
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                      {pattern.averageRating.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFeedback(pattern, true)}
                      title={t('collective.feedback.helpful')}
                    >
                      <ThumbsUp className="h-3.5 w-3.5 text-green-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFeedback(pattern, false)}
                      title={t('collective.feedback.inaccurate')}
                    >
                      <ThumbsDown className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
