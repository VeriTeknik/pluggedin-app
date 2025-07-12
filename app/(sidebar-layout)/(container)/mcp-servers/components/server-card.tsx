'use client';

import { AlertCircle, Check, CheckCircle, Globe, RefreshCw, Share2, Terminal, Trash2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isServerShared, unshareServer } from '@/app/actions/social';
import { ShareServerDialog } from '@/components/server/share-server-dialog';
import { McpOAuthStatus } from '@/components/mcp/oauth-status';
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
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { StreamingCliToast } from '@/components/ui/streaming-cli-toast';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { McpServerStatus, McpServerType } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles';
import { cn } from '@/lib/utils';
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
  } else if (server.type === McpServerType.STREAMABLE_HTTP) {
    return <Globe className="h-4 w-4 text-green-500" />;
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
  const [showStreamingToast, setShowStreamingToast] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);

  // Check if server is shared on mount
  useEffect(() => {
    async function checkIfShared() {
      if (!currentProfile?.uuid || !server.uuid) {
        setIsCheckingShareStatus(false);
        return;
      }
      try {
        const result = await isServerShared(currentProfile.uuid, server.uuid);
        setIsShared(result.isShared);
        setSharedUuid(result.server?.uuid || null);
      } catch (_error) {
      } finally {
        setIsCheckingShareStatus(false);
      }
    }
    checkIfShared();
  }, [currentProfile?.uuid, server.uuid]);
  
  // Check if server requires auth
  useEffect(() => {
    const config = server.config as any;
    console.log(`[ServerCard] Server ${server.name} config:`, config);
    console.log(`[ServerCard] Server ${server.name} full data:`, server);
    if (config?.requires_auth) {
      console.log(`[ServerCard] Server ${server.name} requires auth!`);
      setRequiresAuth(true);
    }
  }, [server.config]);


  const handleShareStatusChange = (newIsShared: boolean, newSharedUuid: string | null) => {
    setIsShared(newIsShared);
    setSharedUuid(newSharedUuid);
  };

  const handleDiscover = () => {
    if (!currentProfile?.uuid || !server.uuid) {
      toast({ title: t('common.error'), description: t('mcpServers.errors.missingInfo'), variant: 'destructive' });
      return;
    }
    setIsDiscovering(true);
    setShowStreamingToast(true);
  };

  const handleDiscoveryComplete = (success: boolean, data?: any) => {
    setIsDiscovering(false);
    // Don't show additional toast for success since streaming interface already shows completion
    // Only show error toast if discovery failed
    if (!success) {
      toast({ 
        title: t('common.error'), 
        description: t('mcpServers.errors.discoveryFailed'), 
        variant: 'destructive' 
      });
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
    <>
      <Card className={cn("relative", isSelected && "ring-2 ring-primary")}>
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
        <CardTitle className="mt-3 text-base sm:text-xl">
          <Link href={`/mcp-servers/${server.uuid}`} className="hover:text-primary transition-colors line-clamp-1">
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
        <CardDescription className="line-clamp-2">
          {server.description || t('mcpServers.form.descriptionPlaceholder')}
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Badge 
              variant="outline" 
              className={cn(
                "dark:border-slate-700",
                server.type === McpServerType.SSE && "bg-amber-500/10 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900"
              )}
              title={server.type === McpServerType.SSE ? "SSE transport is deprecated. Consider migrating to Streamable HTTP." : undefined}
            >
              {server.type}
              {server.type === McpServerType.SSE && (
                <AlertCircle className="ml-1 h-3 w-3" />
              )}
            </Badge>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground justify-end">
            {server.status === McpServerStatus.ACTIVE ? (
              <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900">
                <CheckCircle className="mr-1 h-3 w-3" />
                <span className="hidden sm:inline">{t('mcpServers.status.active')}</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900">
                <XCircle className="mr-1 h-3 w-3" />
                <span className="hidden sm:inline">{t('mcpServers.status.inactive')}</span>
              </Badge>
            )}
          </div>
          
          {server.type === McpServerType.STDIO && server.command && (
            <div className="col-span-2 mt-2">
              <p className="text-xs text-muted-foreground font-mono truncate">
                $ {server.command} {server.args?.join(' ') || ''}
              </p>
            </div>
          )}
          
          {(server.type === McpServerType.SSE || server.type === McpServerType.STREAMABLE_HTTP) && server.url && (
            <div className="col-span-2 mt-2">
              <p className="text-xs text-muted-foreground font-mono truncate">
                {server.url}
              </p>
            </div>
          )}
          
          {/* OAuth Button - only show for servers that require auth */}
          {requiresAuth && (server.type === McpServerType.STREAMABLE_HTTP || server.type === McpServerType.SSE) && (
            <div className="col-span-2 mt-2">
              <McpOAuthStatus 
                serverUuid={server.uuid} 
                serverName={server.name}
                serverType={server.type}
              />
            </div>
          )}
          
          <div className="col-span-2 text-xs text-muted-foreground mt-2">
            {t('mcpServers.form.created')}: {new Date(server.created_at).toLocaleDateString()}
          </div>
        </div>
      </CardContent>
      
      <CardFooter className="flex flex-wrap gap-2 pt-2">
        <Button variant="outline" size="sm" asChild className="dark:border-slate-700 dark:hover:bg-slate-800 flex-1 sm:flex-none">
          <Link href={`/mcp-servers/${server.uuid}`}>
            {t('mcpServers.actions.edit')}
          </Link>
        </Button>

        {/* Share / Unshare Button */}
        {currentProfile && !isCheckingShareStatus && (
          isShared ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-green-600 dark:text-green-500 dark:border-slate-700 dark:hover:bg-slate-800 flex-1 sm:flex-none">
                  <Check className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">{t('mcpServers.actions.shared')}</span>
                  <span className="sm:hidden">Shared</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="w-[calc(100%-2rem)] sm:w-full sm:max-w-lg">
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
              onShareStatusChange={handleShareStatusChange}
            >
              {/* Custom trigger button */}
              <Button variant="outline" size="sm" className="dark:border-slate-700 dark:hover:bg-slate-800 flex-1 sm:flex-none">
                <Share2 className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">{t('mcpServers.actions.share')}</span>
                <span className="sm:hidden">Share</span>
              </Button>
            </ShareServerDialog>
          )
        )}
        {isCheckingShareStatus && (
           <Button variant="outline" size="sm" disabled className="flex-1 sm:flex-none">...</Button> // Loading indicator
        )}

        {/* Discover Tools Button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={handleDiscover}
          disabled={isDiscovering}
          className="dark:border-slate-700 dark:hover:bg-slate-800 flex-1 sm:flex-none"
        >
          <RefreshCw size={14} className={`mr-1 ${isDiscovering ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{isDiscovering ? t('mcpServers.actions.discovering') : t('mcpServers.actions.discover')}</span>
          <span className="sm:hidden">{isDiscovering ? 'Discovering' : 'Discover'}</span>
        </Button>
        
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          className="flex-1 sm:flex-none"
        >
          <Trash2 size={14} className="mr-1" />
          <span className="hidden sm:inline">{t('mcpServers.actions.delete')}</span>
          <span className="sm:hidden">Delete</span>
        </Button>
      </CardFooter>
    </Card>
    
    {/* Streaming CLI Toast for discovery */}
    <StreamingCliToast
      isOpen={showStreamingToast}
      onClose={() => setShowStreamingToast(false)}
      title={`Discovering tools for ${server.name}`}
      serverUuid={server.uuid}
      profileUuid={currentProfile?.uuid || ''}
      onComplete={handleDiscoveryComplete}
    />
  </>
  );
}
