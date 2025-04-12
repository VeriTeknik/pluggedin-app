'use client';

// Final import sort
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getFollowing, searchUsers } from '@/app/actions/social';
import { EmbeddedChats } from '@/components/profile/embedded-chats';
import { SharedCollections } from '@/components/profile/shared-collections';
import { SharedServers } from '@/components/profile/shared-servers';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { users } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';
import { EmbeddedChat, SharedCollection, SharedMcpServer } from '@/types/social';

type User = typeof users.$inferSelect; // Define User type

export default function DiscoverPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { session } = useAuth(); 
  // Safely access user ID - Check if session and user exist, then access id.
  // The type from next-auth might be { name, email, image }, so we cast to access id.
  const currentUserId = (session?.user as { id?: string })?.id; 

  const [isLoading, setIsLoading] = useState(true);
  const [followingUsers, setFollowingUsers] = useState<User[]>([]); // State for followed users
  const [suggestedUsers, setSuggestedUsers] = useState<User[]>([]); // State for suggested users
  const [sharedServers, setSharedServers] = useState<SharedMcpServer[]>([]);
  const [sharedCollections, setSharedCollections] = useState<SharedCollection[]>([]);
  const [embeddedChats, setEmbeddedChats] = useState<EmbeddedChat[]>([]);
  
  useEffect(() => {
    async function loadData() {
      if (!currentUserId) { // Check for user ID
        setIsLoading(false);
        return;
      }
      
      try {
        // Get users the current user is following
        const followedUsers = await getFollowing(currentUserId); // Use userId
        console.log('--- Fetched Followed Users ---:', JSON.stringify(followedUsers, null, 2)); // Log the raw data
        setFollowingUsers(followedUsers);
        
        // Get suggested public users
        const publicUsers = await searchUsers('', 10); // Use searchUsers
        // Filter out current user and users already followed
        const filteredSuggestedUsers = publicUsers.filter(user => 
          user.id !== currentUserId && 
          !followedUsers.some(f => f.id === user.id)
        );
        setSuggestedUsers(filteredSuggestedUsers);
        
        // --- Shared Content Fetching (Needs Refactor) ---
        // The logic below still relies on profile UUIDs. 
        // This needs to be refactored if sharing becomes user-based, 
        // or adapted to fetch profiles for followed users first.
        // Commenting out for now to focus on fixing the People tab.
        /*
        const servers: SharedMcpServer[] = [];
        const collections: SharedCollection[] = [];
        const chats: EmbeddedChat[] = [];
        
        // TODO: Refactor this section. Need to decide how to fetch shared content.
        // Option 1: Fetch profiles for followedUsers, then fetch content per profile.
        // Option 2: Refactor sharing to be user-based and update API endpoints.
        
        // Example (Conceptual - Needs Profile Fetching Logic):
        // for (const user of followedUsers) {
        //   // Fetch user's primary profile (or relevant profiles)
        //   // const userProfiles = await getProfilesForUser(user.id); 
        //   // for (const profile of userProfiles) { ... fetch content ... }
        // }

        const uniqueServers = servers.filter((server, index, self) =>
          index === self.findIndex((s) => s.uuid === server.uuid)
        );
        uniqueServers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        collections.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        chats.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        setSharedServers(uniqueServers);
        setSharedCollections(collections);
        setEmbeddedChats(chats);
        */
        // --- End Shared Content Fetching ---

      } catch (error) {
        console.error('Error loading data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load discover feed',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    }
    
    loadData();
  }, [currentUserId, toast]); // Depend on currentUserId
  
  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-2">Discover</h1>
      <p className="text-muted-foreground mb-8">
        Explore content and connect with others
      </p>
      
      <Tabs defaultValue="people" className="space-y-4">
        <TabsList>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="servers">MCP Servers ({sharedServers.length})</TabsTrigger>
          <TabsTrigger value="collections">Collections ({sharedCollections.length})</TabsTrigger>
          <TabsTrigger value="chats">Embedded Chats ({embeddedChats.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="people" className="space-y-8">
          {/* Following Section - Updated to use followingUsers */}
          {followingUsers.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Following</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {followingUsers.map((user) => ( // Iterate over users
                  <Card key={user.id} className="hover:bg-accent/50 transition-colors"> {/* Use user.id */}
                    <CardHeader className="flex flex-row items-center gap-4">
                      <Avatar className="h-12 w-12">
                        {/* Use user.avatar_url or user.image */}
                        <AvatarImage src={user.avatar_url || user.image || ''} /> 
                        <AvatarFallback>{user.name?.[0] || user.email?.[0] || 'U'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h3 className="font-semibold">{user.name || user.username}</h3> {/* Display name or username */}
                        {user.username && (
                          <p className="text-sm text-muted-foreground">@{user.username}</p>
                        )}
                      </div>
                      <Button 
                        variant="ghost" 
                        onClick={() => router.push(`/to/${user.username}`)} // Use user.username
                        disabled={!user.username} // Disable if no username
                      >
                        View Profile
                      </Button>
                    </CardHeader>
                    {user.bio && ( // Use user.bio
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-2">{user.bio}</p>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div>
            {/* Suggested Profiles Section - Updated to use suggestedUsers */}
            <h2 className="text-xl font-semibold mb-4">Suggested Users</h2> 
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : suggestedUsers.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {suggestedUsers.map((user) => ( // Iterate over users
                  <Card key={user.id} className="hover:bg-accent/50 transition-colors"> {/* Use user.id */}
                    <CardHeader className="flex flex-row items-center gap-4">
                      <Avatar className="h-12 w-12">
                         {/* Use user.avatar_url or user.image */}
                        <AvatarImage src={user.avatar_url || user.image || ''} />
                        <AvatarFallback>{user.name?.[0] || user.email?.[0] || 'U'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h3 className="font-semibold">{user.name || user.username}</h3> {/* Display name or username */}
                        {user.username && (
                          <p className="text-sm text-muted-foreground">@{user.username}</p>
                        )}
                      </div>
                      <Button 
                        variant="ghost" 
                        onClick={() => router.push(`/to/${user.username}`)} // Use user.username
                        disabled={!user.username} // Disable if no username
                      >
                        View Profile
                      </Button>
                    </CardHeader>
                    {user.bio && ( // Use user.bio directly
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-2">{user.bio}</p>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <h2 className="text-xl font-semibold mb-2">No suggested users</h2> {/* Updated text */}
                <p className="text-muted-foreground mb-4">
                  Try searching for specific users or check back later
                </p>
                <Button onClick={() => router.push('/search/users')}>
                  Search for Users
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="servers">
          <SharedServers servers={sharedServers} />
        </TabsContent>

        <TabsContent value="collections">
          <SharedCollections collections={sharedCollections} />
        </TabsContent>

        <TabsContent value="chats">
          <EmbeddedChats chats={embeddedChats} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
