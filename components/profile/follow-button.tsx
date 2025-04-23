'use client';

// Re-sorted imports
import { Loader, UserMinus, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { followUser, unfollowUser } from '@/app/actions/social';
import { Button } from '@/components/ui/button';


export interface FollowButtonProps { // Export interface
  followerUserId: string; // Changed from followerUuid
  followedUserId: string; // Changed from followedUuid
  isFollowing: boolean;
  className?: string;
}

export function FollowButton({
  followerUserId, // Changed from followerUuid
  followedUserId, // Changed from followedUuid
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
      // Use new user-centric functions
      const result = followState
        ? await unfollowUser(followerUserId, followedUserId) 
        : await followUser(followerUserId, followedUserId);

      if (result.success) {
        setFollowState(!followState);
        router.refresh();
      } else {
        setError(result.error || 'An error occurred');
      }
    } catch (_error) {
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
