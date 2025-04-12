'use client';

import { Trash2 } from 'lucide-react';
import { Check, CheckCircle, Globe, RefreshCw, Share2, Terminal, XCircle } from 'lucide-react'; // Sorted
import Link from 'next/link'; // Sorted
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react'; // Sorted
import { useTranslation } from 'react-i18next';

import { discoverSingleServerTools } from '@/app/actions/discover-mcp-tools';
import { isServerShared, unshareServer } from '@/app/actions/social';
import { ShareServerDialog } from '@/components/server/share-server-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'; // Corrected import path again
import { Badge } from '@/components/ui/badge'; // Sorted
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'; // Sorted
import { McpServerStatus, McpServerType } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles';
import { useToast } from '@/hooks/use-toast';
import { McpServer } from '@/types/mcp-server';

interface ServerCardProps {
  server: McpServer;
  onStatusChange?: (checked: boolean) => void;
  onDelete?: () => void;
  isSelected?: boolean;
  onSelect?: (checked: boolean) => void;
}

const getServerIcon = (server: McpServer) => {
  if (server.type === McpServerType.STDIO) {
    return <Terminal className="h-4 w-4 text-purple-500" />;
  }
  return <Globe className="h-4 w-4 text-blue-500" />;
};

export function ServerCard({
  server,
  onStatusChange,
  onDelete,
  isSelected,
  onSelect,
}: ServerCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { currentProfile } = useProfiles();
  const { toast } = useToast();
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [sharedUuid, setSharedUuid] = useState<string | null>(null);
  const [isCheckingShareStatus, setIsCheckingShareStatus] = useState(true);
  const [isUnsharing, setIsUnsharing] = useState(false);

  // Check shared status on mount
  useEffect(() => {
    async function checkSharedStatus() {
      if (!currentProfile?.uuid || !server.uuid) {
        setIsCheckingShareStatus(false);
        return;
      }
      setIsCheckingShareStatus(true);
      try {
        const result = await isServerShared(currentProfile.uuid, server.uuid);
        setIsShared(result.isShared);
        setSharedUuid(result.server?.uuid || null);
      } catch (error) {
        console.error("Failed to check share status", error);
        // Assume not shared on error
        setIsShared(false);
        setSharedUuid(null);
      } finally {
        setIsCheckingShareStatus(false);
      }
    }
    checkSharedStatus();
  }, [currentProfile?.uuid, server.uuid]);


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

  const handleUnshare = async () => {
    if (!currentProfile?.uuid || !sharedUuid) return;

    setIsUnsharing(true);
    try {
      const result = await unshareServer(currentProfile.uuid, sharedUuid);
      if (result.success) {
        toast({ title: t('common.success'), description: t('mcpServers.actions.unsharedSuccess') });
        setIsShared(false);
        setSharedUuid(null);
        router.refresh(); // Refresh page to update UI potentially elsewhere
      } else {
        throw new Error(result.error || t('mcpServers.errors.unshareFailed'));
      }
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } finally {
      setIsUnsharing(false);
    }
  };

  return (
    <Card className="relative group hover:shadow-md transition-all dark:bg-slate-900/70 dark:border-slate-800 dark:hover:bg-slate-900/90">
      {/* Add selection checkbox */}
      <div className="absolute top-2 left-2 z-10">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => onSelect?.(checked as boolean)}
                  disabled={!isShared}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {isShared 
                ? t('mcpServers.actions.selectForCollection')
                : t('mcpServers.errors.mustBeSharedForCollection')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
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
          {server.notes?.includes("Imported from") && (
            <div className="mt-1">
              <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400">
                Forked
              </Badge>
            </div>
          )}
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

        {/* Share / Unshare Button */}
        {currentProfile && !isCheckingShareStatus && (
          isShared ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-green-600 dark:text-green-500 dark:border-slate-700 dark:hover:bg-slate-800">
                  <Check className="h-4 w-4 mr-2" />
                  {t('mcpServers.actions.shared')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('mcpServers.actions.unshareConfirmTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('mcpServers.actions.unshareConfirmDesc')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleUnshare}
                    disabled={isUnsharing}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isUnsharing ? t('common.processing') : t('mcpServers.actions.unshare')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <ShareServerDialog
              server={server}
              profileUuid={currentProfile.uuid}
              variant="outline"
              size="sm"
            >
              {/* Custom trigger button */}
              <Button variant="outline" size="sm" className="dark:border-slate-700 dark:hover:bg-slate-800">
                 <Share2 className="h-4 w-4 mr-2" />
                 {t('mcpServers.actions.share')}
              </Button>
            </ShareServerDialog>
          )
        )}
        {isCheckingShareStatus && (
           <Button variant="outline" size="sm" disabled>...</Button> // Loading indicator
        )}

        {/* Discover Tools Button */}
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
