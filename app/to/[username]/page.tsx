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
  const { username } = params;
  const profile = await getProfileByUsername(username);

  if (!profile) {
    return {
      title: 'Profile Not Found',
    };
  }

  return {
    title: `${profile.name} (@${username}) - Plugged.in`,
    description: profile.bio || `View ${profile.name}'s profile on Plugged.in`,
  };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username } = params;
  const profile = await getProfileByUsername(username);

  if (!profile) {
    notFound();
  }

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
  
  // Get follow counts
  const followerCount = await getFollowerCount(profile.uuid);
  const followingCount = await getFollowingCount(profile.uuid);
  
  // Check if the current user is following this profile
  const currentlyFollowing = currentUserProfile 
    ? await isFollowing(currentUserProfile.uuid, profile.uuid) 
    : false;
    
  // Get shared content
  const sharedServers = await getSharedMcpServers(profile.uuid);
  const sharedCollections = await getSharedCollections(profile.uuid);
  const embeddedChats = await getEmbeddedChats(profile.uuid);
  
  // Determine if the current user is the owner of this profile
  const isOwner = currentUserProfile?.uuid === profile.uuid;

  return (
    <div className="container py-8 pb-16 max-w-5xl mx-auto">
      <ProfileHeader
        profile={profile}
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