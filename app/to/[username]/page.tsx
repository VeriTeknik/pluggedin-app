import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { eq } from 'drizzle-orm';

import { 
  getProfileByUsername, 
  getFollowerCount, 
  getFollowingCount,
  isFollowing,
  getSharedMcpServers,
  getSharedCollections,
  getEmbeddedChats
} from '@/app/actions/social';
import { getAuthSession } from '@/lib/auth';
import { getProjectActiveProfile } from '@/app/actions/profiles';
import { db } from '@/db';
import { projectsTable } from '@/db/schema';

import { ProfileHeader } from '@/components/profile/profile-header';
import { ProfileTabs } from '@/components/profile/profile-tabs';

interface ProfilePageProps {
  params: {
    username: string;
  };
}

export async function generateMetadata({
  params,
}: ProfilePageProps): Promise<Metadata> {
  const username = await params.username;
  const result = await getProfileByUsername(username);

  if (!result) {
    return {
      title: 'Profile Not Found',
    };
  }

  const { user, profiles } = result;
  const primaryProfile = profiles[0];
  const displayName = primaryProfile?.name || user.name || user.username || 'Anonymous';

  return {
    title: `${displayName} (@${username}) - Plugged.in`,
    description: primaryProfile?.bio || `View ${displayName}'s profile on Plugged.in`,
  };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const username = await params.username;
  const result = await getProfileByUsername(username);

  if (!result) {
    return notFound();
  }

  const { user, profiles } = result;

  // Get the current user session
  const session = await getAuthSession();
  let currentUserProfile = null;
  
  // Get the current user's profile if they are logged in
  if (session?.user?.id) {
    // Get the user's project first
    const project = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.user_id, session.user.id))
      .limit(1);

    if (project[0]) {
      currentUserProfile = await getProjectActiveProfile(project[0].uuid);
    }
  }

  // Use the first public profile for stats (we'll aggregate these later)
  const primaryProfile = profiles[0];
  
  if (!primaryProfile) {
    // User exists but has no public profiles yet
    return (
      <div className="container py-8 pb-16 max-w-5xl mx-auto">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">@{username}</h1>
          <p className="text-muted-foreground">This user hasn't made any profiles public yet.</p>
        </div>
      </div>
    );
  }
  
  // Get follow counts for the primary profile
  const followerCount = await getFollowerCount(primaryProfile.uuid);
  const followingCount = await getFollowingCount(primaryProfile.uuid);
  
  // Check if the current user is following this profile
  const currentlyFollowing = currentUserProfile 
    ? await isFollowing(currentUserProfile.uuid, primaryProfile.uuid) 
    : false;
    
  // Get shared content from all public profiles
  const sharedServers = await Promise.all(profiles.map(p => getSharedMcpServers(p.uuid))).then(servers => servers.flat());
  const sharedCollections = await Promise.all(profiles.map(p => getSharedCollections(p.uuid))).then(collections => collections.flat());
  const embeddedChats = await Promise.all(profiles.map(p => getEmbeddedChats(p.uuid))).then(chats => chats.flat());
  
  // Determine if the current user is the owner
  const isOwner = session?.user?.id === user.id;

  return (
    <div className="container py-8 pb-16 max-w-5xl mx-auto">
      <ProfileHeader
        user={user}
        profile={primaryProfile}
        currentUserProfile={currentUserProfile}
        isFollowing={currentlyFollowing}
        followerCount={followerCount}
        followingCount={followingCount}
      />
      
      <div className="mt-8">
        <ProfileTabs 
          sharedServers={sharedServers}
          sharedCollections={sharedCollections}
          embeddedChats={embeddedChats}
          isOwner={isOwner}
        />
      </div>
    </div>
  );
} 