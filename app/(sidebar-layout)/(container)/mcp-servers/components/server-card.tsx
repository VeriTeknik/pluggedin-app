'use client';

import { CheckCircle, Globe, Terminal, Trash2, XCircle } from 'lucide-react';
import { RefreshCw } from 'lucide-react'; // Import RefreshCw icon
import Link from 'next/link';
import { useState } from 'react'; // Import useState
import { useTranslation } from 'react-i18next';

import { discoverSingleServerTools } from '@/app/actions/discover-mcp-tools'; // Import the action
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { McpServerStatus, McpServerType } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles'; // Import useProfiles
import { useToast } from '@/hooks/use-toast'; // Import useToast
import { McpServer } from '@/types/mcp-server';

interface ServerCardProps {
  server: McpServer;
  onStatusChange: (checked: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
}

const getServerIcon = (server: McpServer) => {
  if (server.type === McpServerType.STDIO) {
    return <Terminal className="h-4 w-4 text-purple-500" />;
  }
  return <Globe className="h-4 w-4 text-blue-500" />;
};

export function ServerCard({ server, onStatusChange, onDelete }: ServerCardProps) {
  const { t } = useTranslation();
  const { currentProfile } = useProfiles(); // Get current profile
  const { toast } = useToast();
  const [isDiscovering, setIsDiscovering] = useState(false);

  const handleDiscover = async () => {
    if (!currentProfile?.uuid || !server.uuid) {
      toast({ title: t('common.error'), description: t('mcpServers.errors.missingInfo'), variant: 'destructive' });
      return;
    }
    setIsDiscovering(true);
    try {
      const result = await discoverSingleServerTools(currentProfile.uuid, server.uuid);
      if (result.success) {
        toast({ title: t('common.success'), description: result.message });
      } else {
        throw new Error(result.error || t('mcpServers.errors.discoveryFailed'));
      }
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } finally {
      setIsDiscovering(false);
    }
  };

  return (
    <Card className="group hover:shadow-md transition-all dark:bg-slate-900/70 dark:border-slate-800 dark:hover:bg-slate-900/90">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary/10 dark:bg-primary/20">
            {getServerIcon(server)}
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Switch
                    checked={server.status === McpServerStatus.ACTIVE}
                    onCheckedChange={onStatusChange}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {server.status === McpServerStatus.ACTIVE ? t('mcpServers.status.active') : t('mcpServers.status.inactive')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <CardTitle className="mt-3 text-xl">
          <Link href={`/mcp-servers/${server.uuid}`} className="hover:text-primary transition-colors">
            {server.name}
          </Link>
        </CardTitle>
        <CardDescription>
          {server.description || t('mcpServers.form.descriptionPlaceholder')}
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Badge variant="outline" className="dark:border-slate-700">
              {server.type}
            </Badge>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground justify-end">
            {server.status === McpServerStatus.ACTIVE ? (
              <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900">
                <CheckCircle className="mr-1 h-3 w-3" />
                {t('mcpServers.status.active')}
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900">
                <XCircle className="mr-1 h-3 w-3" />
                {t('mcpServers.status.inactive')}
              </Badge>
            )}
          </div>
          
          {server.type === McpServerType.STDIO && (
            <div className="col-span-2 mt-2">
              <p className="text-xs text-muted-foreground font-mono truncate">
                $ {server.command} {server.args.join(' ')}
              </p>
            </div>
          )}
          
          {server.type === McpServerType.SSE && server.url && (
            <div className="col-span-2 mt-2">
              <p className="text-xs text-muted-foreground font-mono truncate">
                {server.url}
              </p>
            </div>
          )}
          
          <div className="col-span-2 text-xs text-muted-foreground mt-2">
            {t('mcpServers.form.created')}: {new Date(server.created_at).toLocaleDateString()}
          </div>
        </div>
      </CardContent>
      
      <CardFooter className="flex justify-between pt-2">
        <Button variant="outline" size="sm" asChild className="dark:border-slate-700 dark:hover:bg-slate-800">
          <Link href={`/mcp-servers/${server.uuid}`}>
            {t('mcpServers.actions.edit')}
          </Link>
        </Button>
        {/* Add Discover Tools Button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={handleDiscover}
          disabled={isDiscovering}
          className="dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <RefreshCw size={14} className={`mr-1 ${isDiscovering ? 'animate-spin' : ''}`} />
          {isDiscovering ? t('mcpServers.actions.discovering') : t('mcpServers.actions.discover')}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
        >
          <Trash2 size={14} className="mr-1" />
          {t('mcpServers.actions.delete')}
        </Button>
      </CardFooter>
    </Card>
  );
}
