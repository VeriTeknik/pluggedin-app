'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getUserVotingTier } from '@/app/actions/roadmap';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateFeatureDialog } from '@/components/roadmap/CreateFeatureDialog';
import { FeatureRequestsTable } from '@/components/roadmap/FeatureRequestsTable';
import { VoteWeightBadge } from '@/components/roadmap/VoteWeightBadge';

interface RoadmapTabProps {
  profileUuid?: string;
  isAdmin?: boolean;
}

export function RoadmapTab({ profileUuid, isAdmin = false }: RoadmapTabProps) {
  const { t } = useTranslation(['roadmap', 'analytics']);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [tierInfo, setTierInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadTierInfo = async () => {
    setIsLoading(true);
    try {
      const result = await getUserVotingTier(profileUuid);
      if (result.success && result.data) {
        setTierInfo(result.data);
      } else {
        setError(result.error || 'Failed to load tier info');
      }
    } catch (err) {
      console.error('Error loading tier info:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTierInfo();
  }, [profileUuid, refreshKey]);

  const handleFeatureCreated = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleViewAchievements = () => {
    router.push('/analytics?tab=productivity');
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Tier Badge */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <h2 className="text-2xl font-bold">{t('title', { ns: 'roadmap' })}</h2>
          <p className="text-muted-foreground mt-1">
            {t('description', { ns: 'roadmap' })}
          </p>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          {isLoading ? (
            <Skeleton className="h-20 w-64" />
          ) : tierInfo ? (
            <VoteWeightBadge
              tier={tierInfo.tier}
              weight={tierInfo.weight}
              achievementsUnlocked={tierInfo.achievementsUnlocked}
              totalAchievements={tierInfo.totalAchievements}
              nextTierAt={tierInfo.nextTierAt}
              onViewAchievements={handleViewAchievements}
            />
          ) : null}

          <CreateFeatureDialog onFeatureCreated={handleFeatureCreated} />
        </div>
      </div>

      {/* Gamification Info Card */}
      {tierInfo && tierInfo.weight < 5 && (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {t('tier.unlockMore', { ns: 'roadmap' })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Complete achievements in the Productivity tab to increase your voting power up to 5×
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feature Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Requests</CardTitle>
          <CardDescription>
            Vote on community suggestions and help prioritize our roadmap
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FeatureRequestsTable onRefresh={refreshKey} profileUuid={profileUuid} isAdmin={isAdmin} />
        </CardContent>
      </Card>
    </div>
  );
}
