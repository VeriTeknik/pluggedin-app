'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import CardGrid from '@/app/(sidebar-layout)/(container)/search/components/CardGrid';
import { PaginationUi } from '@/app/(sidebar-layout)/(container)/search/components/PaginationUi';
import { getMcpServers } from '@/app/actions/mcp-servers';
import { getFollowing, searchUsers } from '@/app/actions/social';
import { EmbeddedChats } from '@/components/profile/embedded-chats';
import { SharedCollections } from '@/components/profile/shared-collections';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { McpServerSource, users } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';
import { useProfiles } from '@/hooks/use-profiles';
import { McpServer } from '@/types/mcp-server';
import { PaginatedSearchResult } from '@/types/search';
import { EmbeddedChat, SharedCollection } from '@/types/social';


type User = typeof users.$inferSelect;

const PAGE_SIZE = 8; // Added page size constant

export default function DiscoverPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { session } = useAuth();
  const { t } = useTranslation(); // Added translation hook
  const { currentProfile } = useProfiles(); // Added profiles hook
  const searchParams = useSearchParams(); // Added search params hook
  const profileUuid = currentProfile?.uuid;
  // Safely access user ID - Check if session and user exist, then access id.
  // The type from next-auth might be { name, email, image }, so we cast to access id.
  const currentUserId = (session?.user as { id?: string })?.id;

  const [isLoadingPeople, setIsLoadingPeople] = useState(true); // Renamed isLoading
  const [followingUsers, setFollowingUsers] = useState<User[]>([]); // State for followed users
  const [suggestedUsers, setSuggestedUsers] = useState<User[]>([]); // State for suggested users
  // Removed sharedServers state
  const [sharedCollections, setSharedCollections] = useState<SharedCollection[]>([]);
  const [embeddedChats, setEmbeddedChats] = useState<EmbeddedChat[]>([]);
  const [serverOffset, setServerOffset] = useState(
    parseInt(searchParams.get('serverOffset') || '0')
  ); // Added state for server pagination

  // Fetch People Data
  useEffect(() => {
    async function loadPeopleData() {
      if (!currentUserId) { // Check for user ID
        setIsLoadingPeople(false);
        return;
      }
      setIsLoadingPeople(true);
      try {
        // Get users the current user is following
        const followedUsers = await getFollowing(currentUserId); // Use userId
        setFollowingUsers(followedUsers);

        // Get suggested public users
        const publicUsers = await searchUsers('', 10); // Use searchUsers
        // Filter out current user and users already followed
        const filteredSuggestedUsers = publicUsers.filter(user =>
          user.id !== currentUserId &&
          !followedUsers.some(f => f.id === user.id)
        );
        setSuggestedUsers(filteredSuggestedUsers);

      } catch (error) {
        console.error('Error loading people data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load people feed',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingPeople(false);
      }
    }

    loadPeopleData();
  }, [currentUserId, toast]); // Depend on currentUserId

  // Fetch Installed Servers for the current profile
  const { data: installedServersData, isLoading: isLoadingInstalled } = useSWR<McpServer[]>(
    profileUuid ? `${profileUuid}/installed-mcp-servers` : null,
    () => (profileUuid ? getMcpServers(profileUuid) : Promise.resolve([]))
  );

  // Create a memoized map for quick lookup: 'source:external_id' -> uuid
  const installedServerMap = useMemo(() => {
    const map = new Map<string, string>();
    if (installedServersData) {
      installedServersData.forEach(server => {
        if (server.source && server.external_id) {
          map.set(`${server.source}:${server.external_id}`, server.uuid);
        }
      });
    }
    return map;
  }, [installedServersData]);

  // Fetch Community Servers
  const communityServersApiUrl = `/api/service/search?source=${McpServerSource.COMMUNITY}&pageSize=${PAGE_SIZE}&offset=${serverOffset}`;
  const {
    data: communityServersData,
    error: communityServersError,
    isLoading: isLoadingCommunityServers
  } = useSWR<PaginatedSearchResult>(
    communityServersApiUrl,
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Failed to fetch community servers: ${res.status} ${res.statusText} - ${errorText}`
        );
      }
      return res.json();
    }
  );

  // Fetch collections
  const {
    data: collectionsData,
    error: collectionsError,
    isLoading: isLoadingCollections
  } = useSWR<SharedCollection[]>(
    '/api/collections',
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Failed to fetch collections: ${res.status} ${res.statusText} - ${errorText}`
        );
      }
      return res.json();
    }
  );

  // Handle server pagination change
  const handleServerPageChange = (page: number) => {
    const newOffset = (page - 1) * PAGE_SIZE;
    setServerOffset(newOffset);
  };

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-2">Discover</h1>
      <p className="text-muted-foreground mb-8">
        Explore content and connect with others
      </p>

      <Tabs defaultValue="people" className="space-y-4">
        <TabsList>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="servers">
            MCP Servers ({communityServersData?.total ?? 0})
          </TabsTrigger>
          <TabsTrigger value="collections">
            Collections ({collectionsData?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="chats">
            Embedded Chats ({embeddedChats.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="people" className="space-y-8">
          {/* Following Section - Updated to use followingUsers */}
          {isLoadingPeople ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
          ) : followingUsers.length > 0 ? (
            <div>
              <h2 className="text-xl font-semibold mb-4">Following</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {followingUsers.map((user) => (
                  <Card key={user.id} className="hover:bg-accent/50 transition-colors">
                    <CardHeader className="flex flex-row items-center gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={user.avatar_url || user.image || ''} />
                        <AvatarFallback>{user.name?.[0] || user.email?.[0] || 'U'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h3 className="font-semibold">{user.name || user.username}</h3>
                        {user.username && (
                          <p className="text-sm text-muted-foreground">@{user.username}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => router.push(`/to/${user.username}`)}
                        disabled={!user.username}
                      >
                        View Profile
                      </Button>
                    </CardHeader>
                    {user.bio && (
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-2">{user.bio}</p>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ) : !isLoadingPeople ? (
             <div className="text-center py-12">
                <h2 className="text-xl font-semibold mb-2">Not Following Anyone Yet</h2>
                <p className="text-muted-foreground mb-4">
                  Find users to follow below or search for specific people.
                </p>
              </div>
          ) : null}

          {/* Suggested Users Section */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Suggested Users</h2>
            {isLoadingPeople ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : suggestedUsers.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {suggestedUsers.map((user) => (
                  <Card key={user.id} className="hover:bg-accent/50 transition-colors">
                    <CardHeader className="flex flex-row items-center gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={user.avatar_url || user.image || ''} />
                        <AvatarFallback>{user.name?.[0] || user.email?.[0] || 'U'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h3 className="font-semibold">{user.name || user.username}</h3>
                        {user.username && (
                          <p className="text-sm text-muted-foreground">@{user.username}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => router.push(`/to/${user.username}`)}
                        disabled={!user.username}
                      >
                        View Profile
                      </Button>
                    </CardHeader>
                    {user.bio && (
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-2">{user.bio}</p>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <h2 className="text-xl font-semibold mb-2">No Suggested Users Found</h2>
                <p className="text-muted-foreground mb-4">
                  Check back later or search for specific users.
                </p>
                <Button onClick={() => router.push('/search/users')}>
                  Search for Users
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* MCP Servers Tab Content */}
        <TabsContent value="servers" className="space-y-4">
          {isLoadingCommunityServers || isLoadingInstalled ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(PAGE_SIZE)].map((_, i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : communityServersError ? (
            <p className="text-destructive text-center py-8">
              {t('search.error')} {/* Reusing search translation */}
            </p>
          ) : communityServersData?.results && Object.keys(communityServersData.results).length > 0 ? (
            <>
              <CardGrid
                items={communityServersData.results}
                installedServerMap={installedServerMap}
              />
              {communityServersData.total > PAGE_SIZE && (
                <PaginationUi
                  currentPage={Math.floor(serverOffset / PAGE_SIZE) + 1}
                  totalPages={Math.ceil(communityServersData.total / PAGE_SIZE)}
                  onPageChange={handleServerPageChange}
                />
              )}
            </>
          ) : (
            <p className="text-center py-12">{t('search.noResults')}</p> // Reusing search translation
          )}
        </TabsContent>

        <TabsContent value="collections">
          {isLoadingCollections ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(PAGE_SIZE)].map((_, i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : collectionsError ? (
            <p className="text-destructive text-center py-8">
              {t('search.error')}
            </p>
          ) : collectionsData && collectionsData.length > 0 ? (
            <SharedCollections collections={collectionsData} />
          ) : (
            <p className="text-center py-12">{t('search.noResults')}</p>
          )}
        </TabsContent>

        <TabsContent value="chats">
          {/* TODO: Implement fetching and display for embedded chats */}
          <EmbeddedChats chats={embeddedChats} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
