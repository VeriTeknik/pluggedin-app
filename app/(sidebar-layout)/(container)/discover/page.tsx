'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { getFollowing } from '@/app/actions/social';
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
        
        // Sort by most recent
        servers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        collections.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        chats.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        setSharedServers(servers);
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
  
  const hasContent = sharedServers.length > 0 || sharedCollections.length > 0 || embeddedChats.length > 0;
  
  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-2">Discover</h1>
      <p className="text-muted-foreground mb-8">
        Explore content shared by people you follow
      </p>
      
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        </div>
      ) : following.length === 0 ? (
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">You're not following anyone yet</h2>
          <p className="text-muted-foreground mb-4">
            Follow other users to see the content they share
          </p>
          <button
            onClick={() => router.push('/search/users')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
          >
            Find People to Follow
          </button>
        </div>
      ) : !hasContent ? (
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">No shared content yet</h2>
          <p className="text-muted-foreground">
            The people you follow haven't shared any content yet
          </p>
        </div>
      ) : (
        <Tabs defaultValue="servers" className="space-y-6">
          <TabsList>
            <TabsTrigger value="servers">
              MCP Servers ({sharedServers.length})
            </TabsTrigger>
            <TabsTrigger value="collections">
              Collections ({sharedCollections.length})
            </TabsTrigger>
            <TabsTrigger value="chats">
              Embedded Chats ({embeddedChats.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="servers" className="space-y-6">
            <h2 className="text-xl font-semibold">Shared MCP Servers</h2>
            <SharedServers servers={sharedServers} />
          </TabsContent>
          
          <TabsContent value="collections" className="space-y-6">
            <h2 className="text-xl font-semibold">Shared Collections</h2>
            <SharedCollections collections={sharedCollections} />
          </TabsContent>
          
          <TabsContent value="chats" className="space-y-6">
            <h2 className="text-xl font-semibold">Embedded Chats</h2>
            <EmbeddedChats chats={embeddedChats} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
} 