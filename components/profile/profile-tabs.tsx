'use client'; // Mark as Client Component

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { Bot } from 'lucide-react';
import { ProfileEmbeddedChat } from '@/components/profile/profile-embedded-chat';
import { EmbeddedChatInfo } from '@/components/profile/embedded-chat-info';

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
  isOwner: boolean;
  username: string;
  embeddedChatData?: any; // Chat data from parent
}

export function ProfileTabs({ 
  username,
  isOwner,
  embeddedChatData
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
    <Tabs defaultValue={embeddedChatData ? "assistant" : "servers"} className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="assistant" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500/10 data-[state=active]:to-blue-500/10">
          <span className="flex items-center gap-1.5">
            <span>AI Assistant</span>
            <span className="text-base">✨</span>
          </span>
        </TabsTrigger>
        <TabsTrigger value="servers">
          MCP Servers ({totalSharedServers}) 
        </TabsTrigger>
        <TabsTrigger value="collections">
          Collections ({collections?.length ?? 0})
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
      
      <TabsContent value="assistant" className="pt-6">
        {embeddedChatData ? (
          <>
            {/* Show chat info card */}
            <EmbeddedChatInfo 
              chatData={embeddedChatData} 
              isOwner={isOwner}
            />
            
            {/* Show embedded chat for non-owners */}
            {!isOwner && (
              <ProfileEmbeddedChat 
                chatData={embeddedChatData} 
                isOwner={false}
              />
            )}
          </>
        ) : (
          <div className="text-center py-16 px-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 mb-6">
              <Bot className="h-10 w-10 text-purple-600 dark:text-purple-400" />
            </div>
            <p className="text-xl font-medium mb-3">No AI Assistant Yet</p>
            <p className="text-muted-foreground max-w-md mx-auto">
              {isOwner 
                ? "✨ Ready to add your AI assistant? Head to the Embedded Chat section to bring your profile to life!"
                : "This profile doesn't have an AI assistant yet. Check back soon!"}
            </p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
