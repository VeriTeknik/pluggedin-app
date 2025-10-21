'use client';

import { CheckCircle2, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { voteOnFeature } from '@/app/actions/roadmap';
import { Button } from '@/components/ui/button';
import { VoteType } from '@/db/schema';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface VoteButtonProps {
  featureRequestUuid: string;
  currentVote?: { vote: VoteType; weight: number };
  onVoteSuccess?: () => void;
  profileUuid?: string;
}

export function VoteButton({
  featureRequestUuid,
  currentVote,
  onVoteSuccess,
  profileUuid,
}: VoteButtonProps) {
  const { t } = useTranslation('roadmap');
  const { toast } = useToast();
  const [isVoting, setIsVoting] = useState(false);

  const handleVote = async (vote: VoteType) => {
    // Prevent concurrent voting actions
    if (isVoting) return;

    setIsVoting(true);
    try {
      const result = await voteOnFeature({
        featureRequestUuid,
        vote,
        profileUuid,
      });

      if (result.success) {
        toast({
          title: currentVote
            ? t('notifications.voteUpdated')
            : t('notifications.voteRecorded'),
          description: result.voteWeight
            ? t('voting.yourVoteWeight', { weight: result.voteWeight })
            : undefined,
        });
        onVoteSuccess?.();
      } else {
        toast({
          title: t('errors.voteFailed'),
          description: result.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('errors.voteFailed'),
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsVoting(false);
    }
  };

  // If user hasn't voted, show both buttons
  if (!currentVote) {
    return (
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleVote(VoteType.YES)}
          disabled={isVoting}
          className="gap-1.5"
        >
          <ThumbsUp className="h-4 w-4" />
          {t('voting.voteYes')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleVote(VoteType.NO)}
          disabled={isVoting}
          className="gap-1.5"
        >
          <ThumbsDown className="h-4 w-4" />
          {t('voting.voteNo')}
        </Button>
      </div>
    );
  }

  // If user has voted, show current vote with ability to change
  return (
    <div className="flex gap-2 items-center">
      <Button
        size="sm"
        variant={currentVote.vote === VoteType.YES ? 'default' : 'outline'}
        onClick={() => handleVote(VoteType.YES)}
        disabled={isVoting}
        className={cn(
          'gap-1.5',
          currentVote.vote === VoteType.YES &&
            'bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800'
        )}
      >
        {currentVote.vote === VoteType.YES ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <ThumbsUp className="h-4 w-4" />
        )}
        {t('voting.voteYes')}
      </Button>
      <Button
        size="sm"
        variant={currentVote.vote === VoteType.NO ? 'default' : 'outline'}
        onClick={() => handleVote(VoteType.NO)}
        disabled={isVoting}
        className={cn(
          'gap-1.5',
          currentVote.vote === VoteType.NO &&
            'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800'
        )}
      >
        {currentVote.vote === VoteType.NO ? (
          <XCircle className="h-4 w-4" />
        ) : (
          <ThumbsDown className="h-4 w-4" />
        )}
        {t('voting.voteNo')}
      </Button>
      {currentVote.weight > 1 && (
        <span className="text-xs text-muted-foreground font-medium">
          {currentVote.weight}×
        </span>
      )}
    </div>
  );
}
