'use client';

import { Award, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface AchievementBadgeProps {
  title: string;
  description: string;
  achieved: boolean;
  progress?: number;
}

export function AchievementBadge({
  title,
  description,
  achieved,
  progress,
}: AchievementBadgeProps) {
  const { t } = useTranslation('analytics');

  return (
    <Card
      className={cn(
        'transition-all',
        achieved
          ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
          : 'border-muted opacity-60'
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'rounded-full p-2',
              achieved
                ? 'bg-green-500 text-white'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {achieved ? <Award className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">{title}</h4>
              {achieved && (
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                  {t('productivity.achievementUnlocked')}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
            {!achieved && progress !== undefined && (
              <div className="space-y-1 pt-2">
                <Progress value={progress} className="h-1.5" />
                <p className="text-xs text-muted-foreground">
                  {t('productivity.achievementProgress', { percent: Math.round(progress) })}
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}