'use client';

import { BarChart3, Library, TrendingUp, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type TimePeriod } from '@/app/actions/analytics';
import { DashboardTab } from '@/components/analytics/tabs/DashboardTab';
import { LibraryTab } from '@/components/analytics/tabs/LibraryTab';
import { ProductivityTab } from '@/components/analytics/tabs/ProductivityTab';
import { ToolsTab } from '@/components/analytics/tabs/ToolsTab';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProfiles } from '@/hooks/use-profiles';

const periods: { value: TimePeriod; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
];

export default function AnalyticsPage() {
  const { t } = useTranslation(['analytics', 'common']);
  const { activeProfile } = useProfiles();
  const [period, setPeriod] = useState<TimePeriod>('7d');

  if (!activeProfile) {
    return (
      <div className="container py-8">
        <Alert>
          <AlertDescription>{t('errors.unauthorized')}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground">{t('dashboard.description')}</p>
        </div>
        <Select value={period} onValueChange={(value: TimePeriod) => setPeriod(value)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder={t('period.7d')} />
          </SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {t(`period.${p.value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tabs.dashboard')}</span>
          </TabsTrigger>
          <TabsTrigger value="tools" className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tabs.tools')}</span>
          </TabsTrigger>
          <TabsTrigger value="library" className="flex items-center gap-2">
            <Library className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tabs.library')}</span>
          </TabsTrigger>
          <TabsTrigger value="productivity" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tabs.productivity')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <DashboardTab profileUuid={activeProfile.uuid} period={period} />
        </TabsContent>

        <TabsContent value="tools" className="space-y-4">
          <ToolsTab profileUuid={activeProfile.uuid} period={period} />
        </TabsContent>

        <TabsContent value="library" className="space-y-4">
          <LibraryTab profileUuid={activeProfile.uuid} period={period} />
        </TabsContent>

        <TabsContent value="productivity" className="space-y-4">
          <ProductivityTab profileUuid={activeProfile.uuid} period={period} />
        </TabsContent>
      </Tabs>
    </div>
  );
}