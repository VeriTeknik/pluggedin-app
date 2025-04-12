import { notFound } from 'next/navigation';
import { Metadata } from 'next';
// Removed unused eq import

// Updated imports for user-centric actions and types
import { 
  getUserByUsername, 
  getUserFollowerCount, 
  getUserFollowingCount,
  isFollowingUser,
  // Commenting out shared content fetching for now
  // getSharedMcpServers,
  // getSharedCollections,
  // getEmbeddedChats
} from '@/app/actions/social';
import { getAuthSession } from '@/lib/auth';
// Removed getProjectActiveProfile, db, projectsTable imports as they are less relevant now for this page's core logic
// import { getProjectActiveProfile } from '@/app/actions/profiles'; 
// import { db } from '@/db';
// import { projectsTable } from '@/db/schema';
import { users } from '@/db/schema'; // Import schema for User type
type User = typeof users.$inferSelect; // Define User type

import { ProfileHeader } from '@/components/profile/profile-header';
import { ProfileTabs } from '@/components/profile/profile-tabs';
// Import types for shared content if needed later
// import { SharedMcpServer, SharedCollection, EmbeddedChat } from '@/types/social'; 

interface ProfilePageProps {
  params: {
    username: string;
  };
}

export async function generateMetadata({
  params,
}: ProfilePageProps): Promise<Metadata> {
  const username = params.username; // No need for await
  const user = await getUserByUsername(username); // Use new function

  if (!user) {
    return {
      title: 'User Not Found', // Updated title
    };
  }

  // Use user fields directly
  const displayName = user.name || user.username || 'Anonymous';

  return {
    title: `${displayName} (@${username}) - Plugged.in`,
    description: user.bio || `View ${displayName}'s profile on Plugged.in`, // Use user.bio
  };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const username = params.username; // No need for await
  const user = await getUserByUsername(username); // Use new function

  if (!user) {
    // User not found or not public
    return notFound(); 
  }

  // Get the current user session
  const session = await getAuthSession();
  const currentUserId = (session?.user as { id?: string })?.id; // Get current user ID
  
  // Get follow counts for the displayed user
  const followerCount = await getUserFollowerCount(user.id); // Use new function with userId
  const followingCount = await getUserFollowingCount(user.id); // Use new function with userId
  
  // Check if the current logged-in user is following the displayed user
  const currentlyFollowing = currentUserId 
    ? await isFollowingUser(currentUserId, user.id) // Use new function with user IDs
    : false;
    
  // --- Shared Content Fetching (Needs Refactor) ---
  // This section needs to be updated based on how sharing is linked (profiles vs users)
  // Commenting out for now.
  const sharedServers: any[] = []; // Placeholder
  const sharedCollections: any[] = []; // Placeholder
  const embeddedChats: any[] = []; // Placeholder
  /*
  // Example: Fetch profiles associated with the user first
  const userProfiles = await db.query.profilesTable.findMany({ 
    where: eq(profilesTable.project_uuid, 
      db.select({ uuid: projectsTable.uuid }).from(projectsTable).where(eq(projectsTable.user_id, user.id)).limit(1) // Assuming one project for now
    ),
    // Add condition for public profiles if sharing depends on profile visibility
  }); 
  
  if (userProfiles.length > 0) {
     // Fetch shared content based on userProfiles[0].uuid or iterate if multiple profiles matter
     // sharedServers = await getSharedMcpServers(userProfiles[0].uuid);
     // sharedCollections = await getSharedCollections(userProfiles[0].uuid);
     // embeddedChats = await getEmbeddedChats(userProfiles[0].uuid);
  }
  */
  // --- End Shared Content Fetching ---
  
  // Determine if the current user is the owner
  const isOwner = currentUserId === user.id;

  return (
    <div className="container py-8 pb-16 max-w-5xl mx-auto">
      {/* Update ProfileHeader props - Assuming ProfileHeader now accepts these props */}
      <ProfileHeader
        user={user} 
        currentUserId={currentUserId} 
        isFollowing={currentlyFollowing}
        followerCount={followerCount}
        followingCount={followingCount}
      />
      
      <div className="mt-8">
         {/* Update ProfileTabs props - pass user or necessary info */}
        <ProfileTabs 
          sharedServers={sharedServers} // Pass empty arrays for now
          sharedCollections={sharedCollections}
          embeddedChats={embeddedChats}
          isOwner={isOwner}
          // Pass user object if tabs need user info
          // user={user} 
        />
      </div>
    </div>
  );
}
