'use client';

import {
  Brain,
  Clipboard,
  Database,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageContainer } from '@/components/ui/page-container';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { ClipboardTab } from './components/ClipboardTab';
import { CollectiveTab } from './components/CollectiveTab';
import { FreshMemoryTab } from './components/FreshMemoryTab';
import { LongTermTab } from './components/LongTermTab';
import { ProceduresTab } from './components/ProceduresTab';
import { useClipboard } from './hooks/useClipboard';
import { useMemoryStats } from './hooks/useMemoryStats';

export default function MemoryContent() {
  const { t } = useTranslation('memory');
  const { entries, isLoading: clipboardLoading, refresh: refreshClipboard, stats: clipboardStats } = useClipboard();
  const { stats: memoryStats, isLoading: statsLoading, refresh: refreshStats } = useMemoryStats();

  const handleRefresh = () => {
    refreshClipboard();
    refreshStats();
  };

  const isLoading = clipboardLoading || statsLoading;

  // Calculate total ring memories
  const totalRingMemories = Object.values(memoryStats.ringCounts || {}).reduce(
    (sum, count) => sum + (count as number || 0),
    0
  );

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
              onClick={handleRefresh}
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
              <div className="text-2xl font-bold">{clipboardStats.total}</div>
              <p className="text-xs text-muted-foreground">
                {t('stats.entries')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Layers className="h-4 w-4" />
                {t('stats.sessions')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{memoryStats.totalSessions}</div>
              <p className="text-xs text-muted-foreground">
                {memoryStats.activeSessions} {t('stats.active')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4" />
                {t('stats.memories')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalRingMemories}</div>
              <p className="text-xs text-muted-foreground">
                {t('stats.inRings')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                {t('stats.fresh')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{memoryStats.totalFreshMemories}</div>
              <p className="text-xs text-muted-foreground">
                {memoryStats.unclassifiedCount} {t('stats.unclassified')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="clipboard" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="clipboard" className="flex items-center gap-2">
              <Clipboard className="h-4 w-4" />
              {t('tabs.clipboard')}
            </TabsTrigger>
            <TabsTrigger value="longterm" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              {t('tabs.longterm')}
            </TabsTrigger>
            <TabsTrigger value="procedures" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              {t('tabs.procedures')}
            </TabsTrigger>
            <TabsTrigger value="fresh" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {t('tabs.fresh')}
            </TabsTrigger>
            <TabsTrigger value="collective" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {t('tabs.collective')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="clipboard" className="flex-1 overflow-auto mt-0">
            {clipboardLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <ClipboardTab entries={entries} onRefresh={refreshClipboard} />
            )}
          </TabsContent>

          <TabsContent value="longterm" className="flex-1 overflow-auto mt-0">
            <LongTermTab onRefresh={refreshStats} />
          </TabsContent>

          <TabsContent value="procedures" className="flex-1 overflow-auto mt-0">
            <ProceduresTab onRefresh={refreshStats} />
          </TabsContent>

          <TabsContent value="fresh" className="flex-1 overflow-auto mt-0">
            <FreshMemoryTab onRefresh={refreshStats} />
          </TabsContent>

          <TabsContent value="collective" className="flex-1 overflow-auto mt-0">
            <CollectiveTab onRefresh={refreshStats} />
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
