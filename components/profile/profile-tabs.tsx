'use client'; // Mark as Client Component

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import CardGrid from '@/app/(sidebar-layout)/(container)/search/components/CardGrid';
import { PaginationUi } from '@/app/(sidebar-layout)/(container)/search/components/PaginationUi';
import { getMcpServers } from '@/app/actions/mcp-servers';
import { getFormattedSharedServersForUser } from '@/app/actions/shared-content';
import { SharedCollections } from '@/components/profile/shared-collections';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProfiles } from '@/hooks/use-profiles';
import { McpServer } from '@/types/mcp-server';
import { SearchIndex } from '@/types/search';
import { SharedCollection } from '@/types/social';

// Keep only necessary type imports

const PAGE_SIZE = 6;

interface ProfileTabsProps {
  // Remove props for data fetched internally
  // sharedCollections: SharedCollection[]; 
  // embeddedChats: EmbeddedChat[];
  isOwner: boolean;
  username: string; 
}

export function ProfileTabs({ 
  username 
}: ProfileTabsProps) {
  const { t } = useTranslation();
  const { currentProfile } = useProfiles();
  const loggedInProfileUuid = currentProfile?.uuid;
  const [serverOffset, setServerOffset] = useState(0);

  // Fetch shared servers for the displayed user (username)
  const fetchSharedServers = async (): Promise<SearchIndex> => {
    return getFormattedSharedServersForUser(username);
  };

  const { 
    data: sharedServersData, 
    error: sharedServersError, 
    isLoading: isLoadingSharedServers 
  } = useSWR(
    username ? `/user/${username}/shared-servers` : null,
    fetchSharedServers
  );

  // Fetch collections for the displayed user
  const fetchCollections = async (url: string): Promise<SharedCollection[]> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch collections');
    }
    return response.json();
  };

  const {
    data: collections,
    error: collectionsError,
    isLoading: isLoadingCollections
  } = useSWR(
    username ? `/api/user/${username}/collections` : null,
    fetchCollections
  );

  // Fetch installed servers for the *logged-in* user
  const fetchInstalledServers = async () => {
    return loggedInProfileUuid ? getMcpServers(loggedInProfileUuid) : [];
  };

  const { data: installedServersData, isLoading: isLoadingInstalled } = useSWR(
    loggedInProfileUuid ? `${loggedInProfileUuid}/installed-mcp-servers` : null,
    fetchInstalledServers
  );

  // Create the installed server map for the logged-in user
  const installedServerMap = useMemo(() => {
    const map = new Map<string, string>();
    if (installedServersData) {
      installedServersData.forEach((server: McpServer) => {
        if (server.source && server.external_id) {
          map.set(`${server.source}:${server.external_id}`, server.uuid);
        }
      });
    }
    return map;
  }, [installedServersData]);

  // Handle pagination change
  const handleServerPageChange = (page: number) => {
    setServerOffset((page - 1) * PAGE_SIZE);
  };

  // Calculate total shared servers
  const totalSharedServers = sharedServersData ? Object.keys(sharedServersData).length : 0;
  
  // Client-side pagination logic
  const paginatedSharedServers = useMemo(() => {
    if (!sharedServersData) return {};
    const keys = Object.keys(sharedServersData);
    const paginatedKeys = keys.slice(serverOffset, serverOffset + PAGE_SIZE);
    const result: SearchIndex = {};
    paginatedKeys.forEach(key => {
      result[key] = sharedServersData[key];
    });
    return result;
  }, [sharedServersData, serverOffset]);
  
  const totalPages = Math.ceil(totalSharedServers / PAGE_SIZE);

  // TODO: Implement fetching for collections and chats similarly using useSWR if needed

  return (
    <Tabs defaultValue="servers" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="servers">
          MCP Servers ({totalSharedServers}) 
        </TabsTrigger>
        <TabsTrigger value="collections">
          Collections ({collections?.length ?? 0})
        </TabsTrigger>
        <TabsTrigger value="chats">
           {/* Update count when chats data is fetched */}
          Embedded Chats (0)
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="servers" className="pt-6 space-y-4">
        {isLoadingSharedServers || isLoadingInstalled ? (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(PAGE_SIZE)].map((_, i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
        ) : sharedServersError ? (
           <p className="text-destructive text-center py-8">
              Failed to load shared servers.
            </p>
        ) : totalSharedServers > 0 ? (
          <>
            <CardGrid 
              items={paginatedSharedServers} 
              installedServerMap={installedServerMap} 
            />
            {totalPages > 1 && (
               <PaginationUi
                  currentPage={Math.floor(serverOffset / PAGE_SIZE) + 1}
                  totalPages={totalPages}
                  onPageChange={handleServerPageChange}
                />
            )}
          </>
        ) : (
           <div className="py-12 text-center">
             <p className="text-muted-foreground text-lg">No shared servers found</p>
           </div>
        )}
      </TabsContent>
      
      <TabsContent value="collections" className="pt-6">
        <SharedCollections 
          collections={collections ?? []} 
          isLoading={isLoadingCollections} 
        />
      </TabsContent>
      
      <TabsContent value="chats" className="pt-6">
         {/* Placeholder - Fetch and render EmbeddedChats here */}
         <p className="text-center text-muted-foreground py-12">Embedded chats coming soon.</p>
        {/* <EmbeddedChats chats={fetchedChats} isLoading={isLoadingChats} /> */}
      </TabsContent>
    </Tabs>
  );
}
