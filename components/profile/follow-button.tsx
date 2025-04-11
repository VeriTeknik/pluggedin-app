'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, UserMinus, Loader } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { followProfile, unfollowProfile } from '@/app/actions/social';

interface FollowButtonProps {
  followerUuid: string;
  followedUuid: string;
  isFollowing: boolean;
  className?: string;
}

export function FollowButton({
  followerUuid,
  followedUuid,
  isFollowing,
  className = '',
}: FollowButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [followState, setFollowState] = useState(isFollowing);
  const [error, setError] = useState<string | null>(null);

  const handleFollow = async () => {
    if (isPending) return;
    setIsPending(true);
    setError(null);

    try {
      const result = followState
        ? await unfollowProfile(followerUuid, followedUuid)
        : await followProfile(followerUuid, followedUuid);

      if (result.success) {
        setFollowState(!followState);
        router.refresh();
      } else {
        setError(result.error || 'An error occurred');
      }
    } catch (err) {
      setError('Failed to update follow status');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div>
      <Button
        onClick={handleFollow}
        variant={followState ? 'outline' : 'default'}
        className={className}
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader className="h-4 w-4 mr-2 animate-spin" />
            {followState ? 'Unfollowing...' : 'Following...'}
          </>
        ) : followState ? (
          <>
            <UserMinus className="h-4 w-4 mr-2" />
            Unfollow
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4 mr-2" />
            Follow
          </>
        )}
      </Button>
      {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
    </div>
  );
} 