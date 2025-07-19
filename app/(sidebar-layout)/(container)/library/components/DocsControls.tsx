'use client';

import { Grid, List, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface DocsControlsProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  viewMode: 'grid' | 'table';
  onViewModeChange: (mode: 'grid' | 'table') => void;
  sourceFilter: 'all' | 'upload' | 'ai_generated' | 'api';
  onSourceFilterChange: (filter: 'all' | 'upload' | 'ai_generated' | 'api') => void;
}

export function DocsControls({
  searchTerm,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sourceFilter,
  onSourceFilterChange,
}: DocsControlsProps) {
  const { t } = useTranslation('library');
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center flex-1">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('controls.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
            aria-label={t('controls.searchPlaceholder')}
          />
        </div>

        {/* Source Filter */}
        <Tabs value={sourceFilter} onValueChange={(value) => onSourceFilterChange(value as 'all' | 'upload' | 'ai_generated' | 'api')}>
          <TabsList>
            <TabsTrigger value="all">{t('controls.sourceFilter.all')}</TabsTrigger>
            <TabsTrigger value="upload">{t('controls.sourceFilter.uploaded')}</TabsTrigger>
            <TabsTrigger value="ai_generated">{t('controls.sourceFilter.aiGenerated')}</TabsTrigger>
            <TabsTrigger value="api">{t('controls.sourceFilter.api')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* View Toggle */}
      <Tabs value={viewMode} onValueChange={(value) => onViewModeChange(value as 'grid' | 'table')}>
        <TabsList>
          <TabsTrigger value="grid" className="flex items-center gap-2">
            <Grid className="h-4 w-4" />
            {t('controls.grid')}
          </TabsTrigger>
          <TabsTrigger value="table" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            {t('controls.table')}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
} 