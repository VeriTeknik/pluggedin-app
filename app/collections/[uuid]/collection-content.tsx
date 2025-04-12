'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createMcpServer } from '@/app/actions/mcp-servers';
import CardGrid from '@/app/(sidebar-layout)/(container)/search/components/CardGrid';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useProfiles } from '@/hooks/use-profiles';
import { useToast } from '@/hooks/use-toast';
import { McpServer } from '@/types/mcp-server';
import { McpIndex } from '@/types/search';

interface CollectionContentProps {
  items: McpServer[];
  title: string;
  description?: string;
}

export function CollectionContent({ items, title, description }: CollectionContentProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentProfile } = useProfiles();
  const [selectedServers, setSelectedServers] = useState<string[]>([]);

  // Convert servers to search index format
  const searchIndex = items.reduce<Record<string, McpIndex>>((acc, server) => {
    if (!server) return acc;
    
    // Convert env object to array of strings
    const envArray = server.env ? Object.entries(server.env).map(([key, value]) => `${key}=${value}`) : [];
    
    acc[server.uuid] = {
      name: server.name || '',
      description: server.description || '',
      command: server.command || '',
      args: server.args || [],
      envs: envArray,
      source: server.source || 'COMMUNITY',
      external_id: server.external_id || server.uuid,
      url: server.url || '',
      githubUrl: null,
      package_name: null,
      github_stars: null,
      package_registry: null,
      package_download_count: null,
      rating: server.averageRating || 0,
      ratingCount: server.ratingCount || 0,
      installation_count: server.installationCount || 0,
      shared_by: server.sharedBy || 'Unknown',
      shared_by_profile_url: null,
      useCount: 0,
      category: undefined,
      tags: []
    };
    return acc;
  }, {});

  const handleInstall = async (server: McpServer) => {
    if (!currentProfile?.uuid) {
      toast({
        title: t('collections.error'),
        description: t('collections.noActiveProfile'),
        variant: 'destructive'
      });
      return;
    }

    try {
      await createMcpServer({
        name: server.name,
        description: server.description || '',
        command: server.command || '',
        args: server.args || [],
        env: server.env || {},
        url: server.url || undefined,
        source: server.source || 'CUSTOM',
        external_id: server.external_id || undefined,
        type: server.type || 'STDIO',
        profileUuid: currentProfile.uuid
      });

      toast({
        title: t('collections.serverInstalled'),
        description: t('collections.serverInstalledDesc', { name: server.name })
      });
    } catch (error) {
      console.error('Failed to install server:', error);
      toast({
        title: t('collections.installError'),
        description: t('collections.installErrorDesc'),
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Back button */}
      <div>
        <Button variant="ghost" asChild className="-ml-2">
          <Link href="/collections">
            <ChevronLeft className="h-4 w-4 mr-2" />
            {t('collections.back')}
          </Link>
        </Button>
      </div>

      {/* Collection header */}
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      </Card>

      {/* Selected servers actions */}
      {selectedServers.length > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              selectedServers.forEach(serverId => {
                const server = items.find(s => s.uuid === serverId);
                if (server) {
                  handleInstall(server);
                }
              });
              setSelectedServers([]);
            }}
          >
            {t('collections.installSelected', { count: selectedServers.length })}
          </Button>
        </div>
      )}

      {/* Server grid */}
      {items.length > 0 ? (
        <CardGrid 
          items={searchIndex}
          installedServerMap={new Map()}
          selectable={true}
          onItemSelect={(serverId: string, selected: boolean) => {
            if (selected) {
              setSelectedServers(prev => [...prev, serverId]);
            } else {
              setSelectedServers(prev => prev.filter(id => id !== serverId));
            }
          }}
          selectedItems={selectedServers}
        />
      ) : (
        <div className="text-center text-muted-foreground">
          {t('collections.noServers')}
        </div>
      )}
    </div>
  );
}