'use client';

import { BarChart3, Library, Lightbulb, TrendingUp, Wrench } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type TimePeriod } from '@/app/actions/analytics';
import { DashboardTab } from '@/components/analytics/tabs/DashboardTab';
import { LibraryTab } from '@/components/analytics/tabs/LibraryTab';
import { ProductivityTab } from '@/components/analytics/tabs/ProductivityTab';
import { RoadmapTab } from '@/components/analytics/tabs/RoadmapTab';
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
import { useProjects } from '@/hooks/use-projects';

const periods: { value: TimePeriod; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
];

export default function AnalyticsPage() {
  const { t } = useTranslation(['analytics', 'common']);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const profileData = useProfiles();
  const activeProfile = profileData.activeProfile;
  const { currentProject } = useProjects();
  const [period, setPeriod] = useState<TimePeriod>('7d');
  const activeTabFromQuery = searchParams?.get('tab') || 'overview';
  const [activeTab, setActiveTab] = useState<string>(activeTabFromQuery);

  // Get admin status from session
  const isCurrentUserAdmin = session?.user?.is_admin ?? false;

  useEffect(() => {
    if (activeTabFromQuery !== activeTab) {
      setActiveTab(activeTabFromQuery);
    }
  }, [activeTabFromQuery, activeTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const params = new URLSearchParams(searchParams?.toString());
    if (value === 'overview') {
      params.delete('tab');
    } else {
      params.set('tab', value);
    }
    const queryString = params.toString();
    router.push(queryString ? `/analytics?${queryString}` : '/analytics');
  };

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
          <p className="text-muted-foreground">
            {t('dashboard.description')}
            {currentProject && (
              <span className="ml-2 text-sm">
                • Current Hub: <span className="font-medium">{currentProject.name || "Unnamed Hub"}</span>
              </span>
            )}
          </p>
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
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="inline-flex h-10 w-full items-center justify-start overflow-x-auto rounded-md bg-muted p-1 text-muted-foreground sm:grid sm:grid-cols-5">
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
          <TabsTrigger value="roadmap" className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            <span className="hidden sm:inline">Roadmap</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <DashboardTab profileUuid={activeProfile.uuid} projectUuid={activeProfile.project_uuid} period={period} />
        </TabsContent>

        <TabsContent value="tools" className="space-y-4">
          <ToolsTab profileUuid={activeProfile.uuid} period={period} />
        </TabsContent>

        <TabsContent value="library" className="space-y-4">
          <LibraryTab profileUuid={activeProfile.uuid} projectUuid={activeProfile.project_uuid} period={period} />
        </TabsContent>

        <TabsContent value="productivity" className="space-y-4">
          <ProductivityTab profileUuid={activeProfile.uuid} period={period} />
        </TabsContent>

        <TabsContent value="roadmap" className="space-y-4">
          <RoadmapTab profileUuid={activeProfile.uuid} isAdmin={isCurrentUserAdmin ?? false} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
