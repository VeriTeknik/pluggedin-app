import { sql } from 'drizzle-orm';
import { Metadata } from 'next';

import { getUserByUsername, getUserFollowerCount, getUserFollowingCount, isFollowingUser } from '@/app/actions/social';
import { ProfileHeader } from '@/components/profile/profile-header';
import { ProfileTabs } from '@/components/profile/profile-tabs';
import { db } from '@/db';
import { users } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

type User = typeof users.$inferSelect; // Define User type

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

interface ProfilePageProps {
  params: {
    username: string;
  };
}

// --- Generate Static Params ---
// Inform Next.js about possible usernames at build time
export async function generateStaticParams() {
  try {
    const allUsers = await db
      .select({ username: users.username })
      .from(users)
      .where(sql`${users.username} IS NOT NULL`);

    // Filter out null/empty usernames just in case
    return allUsers
      .filter((u: { username: string | null }): u is { username: string } => Boolean(u.username))
      .map((user: { username: string }) => ({
        username: user.username,
      }));
  } catch (error) {
    console.error("Error fetching usernames for generateStaticParams:", error);
    return []; // Return empty array on error
  }
}

// Allow rendering for usernames not generated at build time
export const dynamicParams = true;

// Explicitly type params and add searchParams
export async function generateMetadata({
  params,
}: {
  params: { username: string };
}): Promise<Metadata> {
  // Await params before using
  const resolvedParams = await Promise.resolve(params);
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

// --- Async Page Component (Fetches data and renders presentation component) ---
export default async function ProfilePage({
  params,
}: {
  params: { username: string };
}) {
  // Await params before using
  const resolvedParams = await Promise.resolve(params);
  const user = await getUserByUsername(resolvedParams.username);
  const session = await getAuthSession();
  const currentUserId = session?.user?.id;
  const isOwner = currentUserId === user?.id;
  
  if (!user || !user.username) {
    return <div>User not found</div>;
  }

  // Get follower counts and following status
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
