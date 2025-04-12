import { ExternalLink } from 'lucide-react';
import Link from 'next/link';

import { importSharedServer } from '@/app/actions/mcp-servers';
import { ImportServerDialog } from '@/components/server/import-server-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useProfiles } from '@/hooks/use-profiles';
import { SharedMcpServer } from '@/types/social';

interface SharedServersProps {
  servers: SharedMcpServer[];
  isLoading?: boolean;
  showImport?: boolean;
}

export function SharedServers({ servers, isLoading = false, showImport = true }: SharedServersProps) {
  const { currentProfile } = useProfiles();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-6 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-muted rounded w-1/2"></div>
            </CardHeader>
            <CardContent>
              <div className="h-4 bg-muted rounded w-full mb-2"></div>
              <div className="h-4 bg-muted rounded w-4/5"></div>
            </CardContent>
            <CardFooter>
              <div className="h-10 bg-muted rounded w-28"></div>
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground text-lg">No shared servers found</p>
      </div>
    );
  }

  const handleImportServer = async (server: any, name: string) => {
    if (!currentProfile) {
      return { success: false, error: 'No active profile found' };
    }
    
    return importSharedServer(currentProfile.uuid, server, name);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {servers.map((server) => (
        <Card key={server.uuid} className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{server.title}</CardTitle>
            <CardDescription className="line-clamp-1">
              {server.server?.name || 'MCP Server'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            <p className="text-sm text-muted-foreground line-clamp-3">
              {server.description || server.server?.description || 'No description provided'}
            </p>
          </CardContent>
          <CardFooter className="pt-2 flex justify-between">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/servers/${server.server_uuid}`}>
                <ExternalLink className="h-4 w-4 mr-2" />
                View Server
              </Link>
            </Button>
            
            {showImport && currentProfile && (
              <ImportServerDialog
                sharedServer={server}
                onImport={handleImportServer}
                variant="secondary"
                size="sm"
              />
            )}
          </CardFooter>
        </Card>
      ))}
    </div>
  );
} 