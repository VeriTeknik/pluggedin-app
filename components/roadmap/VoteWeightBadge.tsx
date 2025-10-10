'use client';

import { Award, Lock, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface VoteWeightBadgeProps {
  tier: string;
  weight: number;
  achievementsUnlocked: number;
  totalAchievements: number;
  nextTierAt: number | null;
  onViewAchievements?: () => void;
}

const tierColors = {
  Bronze: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-300',
  Silver: 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300 border-gray-300',
  Gold: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-300',
  Platinum: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400 border-cyan-300',
  Diamond: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 border-purple-300',
};

const tierIcons = {
  Bronze: Lock,
  Silver: Award,
  Gold: Award,
  Platinum: Award,
  Diamond: TrendingUp,
};

export function VoteWeightBadge({
  tier,
  weight,
  achievementsUnlocked,
  totalAchievements,
  nextTierAt,
  onViewAchievements,
}: VoteWeightBadgeProps) {
  const { t } = useTranslation('roadmap');

  const TierIcon = tierIcons[tier as keyof typeof tierIcons] || Award;
  const colorClass = tierColors[tier as keyof typeof tierColors] || tierColors.Bronze;

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className={cn('gap-1.5 px-3 py-1.5', colorClass)}>
                <TierIcon className="h-4 w-4" />
                <span className="font-semibold">{tier}</span>
                <span className="text-xs opacity-75">({weight}× votes)</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <div className="space-y-2">
                <p className="font-semibold">{t('tier.current', { tier })}</p>
                <p className="text-sm">
                  {t('voting.voteWeightTooltip')}
                </p>
                <p className="text-sm text-muted-foreground">
                  Achievements: {achievementsUnlocked}/{totalAchievements}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>

          {onViewAchievements && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onViewAchievements}
              className="h-7 text-xs"
            >
              {t('tier.viewAchievements')}
            </Button>
          )}
        </div>

        {nextTierAt !== null ? (
          <p className="text-xs text-muted-foreground">
            {t('tier.progress', {
              count: nextTierAt - achievementsUnlocked,
              nextTier: ['Silver', 'Gold', 'Platinum', 'Diamond'][Math.min(nextTierAt - 1, 3)] || 'Diamond',
            })}
          </p>
        ) : (
          <p className="text-xs text-green-600 dark:text-green-400 font-medium">
            {t('tier.maxTier')}
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}
