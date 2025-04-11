'use client';

import { useState } from 'react';
import { Server, FolderInput, MessageCircle } from 'lucide-react';

import { SharedMcpServer, SharedCollection, EmbeddedChat } from '@/types/social';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SharedServers } from './shared-servers';
import { SharedCollections } from './shared-collections';
import { EmbeddedChats } from './embedded-chats';

interface ProfileTabsProps {
  sharedServers: SharedMcpServer[];
  sharedCollections: SharedCollection[];
  embeddedChats: EmbeddedChat[];
  isOwner: boolean;
  isLoading?: boolean;
}

export function ProfileTabs({ 
  sharedServers, 
  sharedCollections,
  embeddedChats,
  isOwner, 
  isLoading = false 
}: ProfileTabsProps) {
  return (
    <Tabs defaultValue="servers" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
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
      
      <TabsContent value="servers" className="pt-6">
        <SharedServers 
          servers={sharedServers} 
          isLoading={isLoading}
          showImport={!isOwner}
        />
      </TabsContent>
      
      <TabsContent value="collections" className="pt-6">
        <SharedCollections 
          collections={sharedCollections} 
          isLoading={isLoading}
        />
      </TabsContent>
      
      <TabsContent value="chats" className="pt-6">
        <EmbeddedChats 
          chats={embeddedChats} 
          isLoading={isLoading}
        />
      </TabsContent>
    </Tabs>
  );
} 