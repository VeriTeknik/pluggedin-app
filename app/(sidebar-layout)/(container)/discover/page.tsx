'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { getFollowing, searchProfiles } from '@/app/actions/social';
import { useToast } from '@/components/ui/use-toast';
import { useProfiles } from '@/hooks/use-profiles';
import { Profile } from '@/types/profile';
import { SharedMcpServer, SharedCollection, EmbeddedChat } from '@/types/social';
import { SharedServers } from '@/components/profile/shared-servers';
import { SharedCollections } from '@/components/profile/shared-collections';
import { EmbeddedChats } from '@/components/profile/embedded-chats';

export default function DiscoverPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentProfile } = useProfiles();
  
  const [isLoading, setIsLoading] = useState(true);
  const [following, setFollowing] = useState<Profile[]>([]);
  const [sharedServers, setSharedServers] = useState<SharedMcpServer[]>([]);
  const [sharedCollections, setSharedCollections] = useState<SharedCollection[]>([]);
  const [embeddedChats, setEmbeddedChats] = useState<EmbeddedChat[]>([]);
  const [publicProfiles, setPublicProfiles] = useState<Array<any>>([]);
  
  useEffect(() => {
    async function loadData() {
      if (!currentProfile) {
        setIsLoading(false);
        return;
      }
      
      try {
        // Get profiles the current user is following
        const followingProfiles = await getFollowing(currentProfile.uuid);
        setFollowing(followingProfiles);
        
        // Get public profiles
        const profiles = await searchProfiles('', 10); // Get first 10 public profiles
        // Filter out current user's profile and remove duplicates
        const filteredProfiles = profiles.filter(profile => 
          profile.id !== currentProfile.project_uuid && 
          !followingProfiles.some(f => f.project_uuid === profile.id)
        );
        setPublicProfiles(filteredProfiles);
        
        // Get shared content from following profiles
        const servers: SharedMcpServer[] = [];
        const collections: SharedCollection[] = [];
        const chats: EmbeddedChat[] = [];
        
        // For each followed profile, get their public shared content
        for (const profile of followingProfiles) {
          try {
            // Get servers
            const serversResponse = await fetch(`/api/profile/${profile.uuid}/shared-servers`);
            if (serversResponse.ok) {
              const serversData = await serversResponse.json();
              servers.push(...serversData);
            }
            
            // Get collections
            const collectionsResponse = await fetch(`/api/profile/${profile.uuid}/shared-collections`);
            if (collectionsResponse.ok) {
              const collectionsData = await collectionsResponse.json();
              collections.push(...collectionsData);
            }
            
            // Get embedded chats
            const chatsResponse = await fetch(`/api/profile/${profile.uuid}/embedded-chats`);
            if (chatsResponse.ok) {
              const chatsData = await chatsResponse.json();
              chats.push(...chatsData);
            }
          } catch (error) {
            console.error(`Error fetching shared content for profile ${profile.uuid}:`, error);
          }
        }
        
        // Remove duplicates by uuid
        const uniqueServers = servers.filter((server, index, self) =>
          index === self.findIndex((s) => s.uuid === server.uuid)
        );
        
        // Sort by most recent
        uniqueServers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        collections.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        chats.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        setSharedServers(uniqueServers);
        setSharedCollections(collections);
        setEmbeddedChats(chats);
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
  }, [currentProfile, toast]);
  
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
          {following.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Following</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {following.map((profile) => (
                  <Card key={profile.uuid} className="hover:bg-accent/50 transition-colors">
                    <CardHeader className="flex flex-row items-center gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={profile.avatar_url || ''} />
                        <AvatarFallback>{profile.name?.[0] || 'U'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h3 className="font-semibold">{profile.name}</h3>
                        {profile.username && (
                          <p className="text-sm text-muted-foreground">@{profile.username}</p>
                        )}
                      </div>
                      <Button 
                        variant="ghost" 
                        onClick={() => router.push(`/to/${profile.username}`)}
                      >
                        View Profile
                      </Button>
                    </CardHeader>
                    {profile.bio && (
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-2">{profile.bio}</p>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-xl font-semibold mb-4">Suggested Profiles</h2>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : publicProfiles.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {publicProfiles.map((profile) => (
                  <Card key={profile.id} className="hover:bg-accent/50 transition-colors">
                    <CardHeader className="flex flex-row items-center gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={profile.image || ''} />
                        <AvatarFallback>{profile.name?.[0] || 'U'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h3 className="font-semibold">{profile.name}</h3>
                        {profile.username && (
                          <p className="text-sm text-muted-foreground">@{profile.username}</p>
                        )}
                      </div>
                      <Button 
                        variant="ghost" 
                        onClick={() => router.push(`/to/${profile.username}`)}
                      >
                        View Profile
                      </Button>
                    </CardHeader>
                    {profile.profile?.bio && (
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-2">{profile.profile.bio}</p>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <h2 className="text-xl font-semibold mb-2">No suggested profiles</h2>
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