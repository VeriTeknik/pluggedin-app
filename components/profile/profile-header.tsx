// Removed Profile import
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
// Import User type (assuming it's defined or imported from schema)
import { users } from '@/db/schema'; 

import { FollowButton } from './follow-button';
import { ProfileStats } from './profile-stats';

type User = typeof users.$inferSelect;

export interface ProfileHeaderProps { // Export interface
  user: User; // Use the full User type
  currentUserId?: string | null; // Changed from currentUserProfile
  isFollowing: boolean;
  followerCount: number;
  followingCount: number;
}

export function ProfileHeader({
  user,
  currentUserId, // Use currentUserId
  isFollowing,
  followerCount,
  followingCount,
}: ProfileHeaderProps) {
  const isCurrentUser = currentUserId === user.id; // Compare user IDs
  // Use user's avatar_url or image
  const avatarSrc = user.avatar_url || user.image || ''; 
  const hasAvatar = !!avatarSrc;
  const displayName = user.name || user.username || 'Anonymous'; // Use user fields

  return (
    <div className="bg-card rounded-lg shadow-md p-6">
      <div className="flex flex-col md:flex-row md:items-start gap-6">
        {/* Avatar */}
        <Avatar className="h-24 w-24 border-2 border-border">
          {hasAvatar ? (
            <AvatarImage src={avatarSrc} alt={displayName} />
          ) : (
            <AvatarFallback className="text-2xl bg-primary/10 text-primary">
              {displayName[0]?.toUpperCase() || 'U'} {/* Handle potential undefined name */}
            </AvatarFallback>
          )}
        </Avatar>
        
        {/* Profile info */}
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{displayName}</h1>
              {/* Ensure username exists before displaying */}
              {user.username && <p className="text-muted-foreground">@{user.username}</p>} 
              {user.bio && <p className="mt-2 text-sm">{user.bio}</p>} {/* Use user.bio */}
            </div>
            
            {/* Follow button or edit profile button */}
            {/* Check currentUserId exists before showing FollowButton */}
            {!isCurrentUser && currentUserId && ( 
              <FollowButton
                followerUserId={currentUserId} // Pass currentUserId
                followedUserId={user.id} // Pass displayed user's ID
                isFollowing={isFollowing}
              />
            )}
            
            {isCurrentUser && (
              // Link to general settings, as profile settings might merge
              <a href="/settings" className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"> 
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
