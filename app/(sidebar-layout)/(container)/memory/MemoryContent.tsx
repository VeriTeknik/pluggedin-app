'use client';

import {
  Brain,
  Clipboard,
  Clock,
  Database,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageContainer } from '@/components/ui/page-container';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { ClipboardTab } from './components/ClipboardTab';
import { useClipboard } from './hooks/useClipboard';

export default function MemoryContent() {
  const { t } = useTranslation('memory');
  const { entries, isLoading, refresh, stats } = useClipboard();

  return (
    <PageContainer>
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between flex-shrink-0 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Brain className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">{t('title')}</h1>
            </div>
            <p className="text-muted-foreground mt-1">
              {t('description')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              {t('refresh')}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clipboard className="h-4 w-4" />
                {t('stats.clipboard')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                {t('stats.entries')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4" />
                {t('stats.storage')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatBytes(stats.totalSize)}</div>
              <p className="text-xs text-muted-foreground">
                {t('stats.used')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {t('stats.expiring')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.expiringToday}</div>
              <p className="text-xs text-muted-foreground">
                {t('stats.today')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                {t('stats.types')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.contentTypes}</div>
              <p className="text-xs text-muted-foreground">
                {t('stats.contentTypes')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="clipboard" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="clipboard" className="flex items-center gap-2">
              <Clipboard className="h-4 w-4" />
              {t('tabs.clipboard')}
            </TabsTrigger>
            <TabsTrigger value="longterm" className="flex items-center gap-2" disabled>
              <Database className="h-4 w-4" />
              {t('tabs.longterm')}
              <Badge variant="secondary" className="ml-1 text-xs">
                {t('comingSoon')}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="procedures" className="flex items-center gap-2" disabled>
              <Brain className="h-4 w-4" />
              {t('tabs.procedures')}
              <Badge variant="secondary" className="ml-1 text-xs">
                {t('comingSoon')}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="fresh" className="flex items-center gap-2" disabled>
              <Sparkles className="h-4 w-4" />
              {t('tabs.fresh')}
              <Badge variant="secondary" className="ml-1 text-xs">
                {t('comingSoon')}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="clipboard" className="flex-1 overflow-auto mt-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <ClipboardTab entries={entries} onRefresh={refresh} />
            )}
          </TabsContent>

          <TabsContent value="longterm" className="flex-1">
            <ComingSoonCard
              icon={Database}
              title={t('longterm.title')}
              description={t('longterm.description')}
            />
          </TabsContent>

          <TabsContent value="procedures" className="flex-1">
            <ComingSoonCard
              icon={Brain}
              title={t('procedures.title')}
              description={t('procedures.description')}
            />
          </TabsContent>

          <TabsContent value="fresh" className="flex-1">
            <ComingSoonCard
              icon={Sparkles}
              title={t('fresh.title')}
              description={t('fresh.description')}
            />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

interface ComingSoonCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
}

function ComingSoonCard({ icon: Icon, title, description }: ComingSoonCardProps) {
  return (
    <Card className="h-64 flex items-center justify-center">
      <CardContent className="text-center">
        <Icon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <CardTitle className="mb-2">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <Badge variant="outline" className="mt-4">
          Coming Soon
        </Badge>
      </CardContent>
    </Card>
  );
}
