import { Profile } from '@/types/profile';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProfileStats } from './profile-stats';
import { FollowButton } from './follow-button';

interface ProfileHeaderProps {
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    username: string | null;
  };
  profile: Profile;
  currentUserProfile?: Profile | null;
  isFollowing: boolean;
  followerCount: number;
  followingCount: number;
}

export function ProfileHeader({
  user,
  profile,
  currentUserProfile,
  isFollowing,
  followerCount,
  followingCount,
}: ProfileHeaderProps) {
  const isCurrentUser = currentUserProfile?.uuid === profile.uuid;
  const hasAvatar = !!profile.avatar_url;
  const displayName = profile.name || user.name || user.username || 'Anonymous';

  return (
    <div className="bg-card rounded-lg shadow-md p-6">
      <div className="flex flex-col md:flex-row md:items-start gap-6">
        {/* Avatar */}
        <Avatar className="h-24 w-24 border-2 border-border">
          {hasAvatar ? (
            <AvatarImage src={profile.avatar_url!} alt={displayName} />
          ) : (
            <AvatarFallback className="text-2xl bg-primary/10 text-primary">
              {displayName[0].toUpperCase()}
            </AvatarFallback>
          )}
        </Avatar>
        
        {/* Profile info */}
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{displayName}</h1>
              <p className="text-muted-foreground">@{user.username}</p>
              {profile.bio && <p className="mt-2 text-sm">{profile.bio}</p>}
            </div>
            
            {/* Follow button or edit profile button */}
            {!isCurrentUser && currentUserProfile && (
              <FollowButton
                followerUuid={currentUserProfile.uuid}
                followedUuid={profile.uuid}
                isFollowing={isFollowing}
              />
            )}
            
            {isCurrentUser && (
              <a href="/settings/profile" className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors">
                Edit Profile
              </a>
            )}
          </div>
          
          {/* Follower stats */}
          <ProfileStats 
            username={user.username || ''} 
            followerCount={followerCount} 
            followingCount={followingCount} 
          />
        </div>
      </div>
    </div>
  );
} 