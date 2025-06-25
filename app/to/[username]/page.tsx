import { sql } from 'drizzle-orm';
import { Metadata } from 'next';

import { getUserByUsername, getUserFollowerCount, getUserFollowingCount, isFollowingUser } from '@/app/actions/social';
import { ProfileHeader } from '@/components/profile/profile-header';
import { ProfileTabs } from '@/components/profile/profile-tabs';
import { db } from '@/db';
import { users } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

type User = typeof users.$inferSelect;

// --- Non-async Presentation Component ---
function UserProfileDisplay({
  user,
  username,
  currentUserId,
  currentlyFollowing,
  followerCount,
  followingCount,
  isOwner,
}: {
  user: User;
  username: string;
  currentUserId: string | undefined;
  currentlyFollowing: boolean;
  followerCount: number;
  followingCount: number;
  isOwner: boolean;
}) {
  return (
    <div className="container py-8 pb-16 max-w-5xl mx-auto">
      <ProfileHeader
        user={user}
        currentUserId={currentUserId}
        isFollowing={currentlyFollowing}
        followerCount={followerCount}
        followingCount={followingCount}
      />

      <div className="mt-8">
        <ProfileTabs
          isOwner={isOwner}
          username={username}
        />
      </div>
    </div>
  );
}

type PageProps = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

// Force dynamic rendering for this page since it uses headers() via getAuthSession()
// This also prevents database queries during build time
export const dynamic = 'force-dynamic';
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const user = await getUserByUsername(resolvedParams.username);
  
  if (!user) {
    return {
      title: 'User Not Found',
    };
  }

  return {
    title: `${user.name || user.username || 'Unknown'}'s Profile`,
  };
}

// --- Async Page Component ---
export default async function ProfilePage({ params, searchParams }: PageProps) {
  const { username } = await params;
  const user = await getUserByUsername(username);
  const session = await getAuthSession();
  const currentUserId = session?.user?.id;
  const isOwner = currentUserId === user?.id;
  
  if (!user || !user.username) {
    return <div>User not found</div>;
  }

  const followerCount = await getUserFollowerCount(user.id);
  const followingCount = await getUserFollowingCount(user.id);
  const currentlyFollowing = currentUserId ? await isFollowingUser(currentUserId, user.id) : false;

  return (
    <div className="space-y-8">
      <UserProfileDisplay
        user={user}
        username={user.username}
        currentUserId={currentUserId}
        currentlyFollowing={currentlyFollowing}
        followerCount={followerCount}
        followingCount={followingCount}
        isOwner={isOwner}
      />
    </div>
  );
} 