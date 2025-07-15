'use client';

import { useEffect,useState } from 'react';
import { useTranslation } from 'react-i18next';

import { unshareServer } from '@/app/actions/social';
import { UnifiedServerCard } from '@/components/server-card/UnifiedServerCard';
import { ServerDetailDialog } from '@/components/server-detail-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { McpServerSource, McpServerType } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { SearchIndex } from '@/types/search';

import { ClaimServerDialog } from './ClaimServerDialog';
import { InstallDialog } from './InstallDialog';
import { RateServerDialog } from './RateServerDialog';
import { ReviewsDialog } from './ReviewsDialog';

// Helper function to format environment variables
function formatEnvVariables(envs: string[] | Array<{ name: string; description?: string }> | undefined): string {
  if (!envs || !Array.isArray(envs)) return '';
  
  // Handle both string array and object array formats
  if (envs.length === 0) return '';
  
  // Check if it's an array of strings or objects
  if (typeof envs[0] === 'string') {
    // Old format: string[]
    return (envs as string[]).map(env => `${env}=<value>`).join('\n');
  } else {
    // New format: Array<{ name: string; description?: string }>
    return (envs as Array<{ name: string; description?: string }>)
      .map(env => {
        const line = `${env.name}=<value>`;
        return env.description ? `${line} # ${env.description}` : line;
      })
      .join('\n');
  }
}

export default function CardGrid({ 
  items, 
  installedServerMap,
  currentUsername,
  onRefreshNeeded,
  profileUuid, // Add profileUuid prop
  selectable = false,
  selectedItems = [],
  onItemSelect,
}: {
  items: SearchIndex;
  installedServerMap: Map<string, string>;
  currentUsername?: string | null; // Allow null to match session type
  onRefreshNeeded?: () => void;
  profileUuid?: string; // Define the prop type
  selectable?: boolean;
  selectedItems?: string[];
  onItemSelect?: (serverId: string, selected: boolean) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast(); // Initialize toast
  const { isAuthenticated, signIn } = useAuth();
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [authDialogMessage, setAuthDialogMessage] = useState<{ key: string; defaultMsg: string } | null>(null);

  // Analytics tracking removed - will be replaced with new analytics service

  // Helper function to check authentication and show a dialog if not authenticated
  const requireAuth = (descriptionKey: string, descriptionDefault: string): boolean => {
    if (!isAuthenticated) {
      setAuthDialogMessage({ key: descriptionKey, defaultMsg: descriptionDefault });
      setShowAuthDialog(true);
      return false;
    }
    return true;
  };

  const [selectedServer, setSelectedServer] = useState<{
    name: string;
    description: string;
    command: string;
    args: string;
    env: string;
    url: string | undefined;
    type: McpServerType;
    source?: McpServerSource;
    external_id?: string;
  } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // For rating dialog
  const [rateServer, setRateServer] = useState<{
    name: string;
    source?: McpServerSource;
    external_id?: string;
  } | null>(null);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);

  // State for reviews dialog
  const [reviewServer, setReviewServer] = useState<{
    name: string;
    source?: McpServerSource;
    external_id?: string;
  } | null>(null);
  const [reviewsDialogOpen, setReviewsDialogOpen] = useState(false);

  // State for detail dialog
  const [detailServer, setDetailServer] = useState<any | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  
  // State for claim dialog
  const [claimServer, setClaimServer] = useState<any | null>(null);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);

  // Listen for server claim events
  useEffect(() => {
    const handleServerClaimed = (event: CustomEvent) => {
      // Close dialogs and trigger refresh
      setClaimDialogOpen(false);
      setDetailDialogOpen(false);
      // The parent component should handle refreshing the data
      // This event is dispatched by ClaimServerDialog on success
    };

    window.addEventListener('server-claimed', handleServerClaimed as any);
    return () => {
      window.removeEventListener('server-claimed', handleServerClaimed as any);
    };
  }, []);



  const handleInstallClick = async (key: string, item: any) => {
    if (!requireAuth('auth:loginToInstall', 'You must be logged in to install servers.')) return;
    
    // If this is a registry server and we don't have package info, fetch details
    if (item.source === McpServerSource.REGISTRY && (!item.command || item.command === '')) {
      try {
        const response = await fetch(`/api/registry/server/${item.external_id}`);
        const data = await response.json();
        
        if (data.success && data.server) {
          const detailedItem = data.server;
          // Determine if this is a stdio or SSE server
          const isSSE = detailedItem.url || false;
          
          setSelectedServer({
            name: detailedItem.name,
            description: detailedItem.description,
            command: isSSE ? '' : detailedItem.command || '',
            args: isSSE ? '' : (Array.isArray(detailedItem.args) ? detailedItem.args.join(' ') : '') || '',
            env: isSSE ? '' : formatEnvVariables(detailedItem.envs),
            url: isSSE ? detailedItem.url : undefined,
            type: isSSE ? McpServerType.SSE : McpServerType.STDIO,
            source: item.source,
            external_id: item.external_id,
          });
          
          setDialogOpen(true);
          return;
        }
      } catch (error) {
        console.error('Failed to fetch server details:', error);
        // Fall through to use basic info
      }
    }
    
    // For non-registry servers or if fetch failed, use existing data
    const isSSE = item.url || false;
    
    setSelectedServer({
      name: item.name,
      description: item.description,
      command: isSSE ? '' : item.command || '',
      args: isSSE ? '' : (Array.isArray(item.args) ? item.args.join(' ') : '') || '',
      env: isSSE ? '' : formatEnvVariables(item.envs),
      url: isSSE ? item.url : undefined,
      type: isSSE ? McpServerType.SSE : McpServerType.STDIO,
      source: item.source,
      external_id: item.external_id,
    });
    
    setDialogOpen(true);
  };

  // Handle clicking the rate button
  const handleRateClick = (key: string, item: any) => {
    if (!requireAuth('auth:loginToRate', 'You must be logged in to rate servers.')) return;
    setRateServer({
      name: item.name,
      source: item.source,
      external_id: item.external_id,
    });
    
    setRateDialogOpen(true);
  };

  // Handle clicking the reviews count
  const handleReviewsClick = (item: any) => {
    setReviewServer({
      name: item.name,
      source: item.source,
      external_id: item.external_id,
    });
    setReviewsDialogOpen(true);
  };

  // Handle clicking the view details button
  const handleViewDetailsClick = (e: React.MouseEvent, item: any) => {
    e.stopPropagation(); // Prevent card click
    
    // Analytics tracking removed - will be replaced with new analytics service
    
    setDetailServer({
      name: item.name,
      type: item.url ? McpServerType.SSE : McpServerType.STDIO,
      description: item.description,
      command: item.command || '',
      args: Array.isArray(item.args) ? item.args : [],
      env: item.envs ? formatEnvVariables(item.envs) : undefined,
      url: item.url,
      source: item.source,
      external_id: item.external_id,
      github_stars: item.github_stars,
      package_download_count: item.package_download_count,
      installation_count: item.installation_count,
      rating: item.rating,
      ratingCount: item.ratingCount,
      shared_by: item.shared_by,
      tags: item.tags,
      category: item.category,
      is_claimed: item.is_claimed,
      uuid: item.uuid,
    });
    setDetailDialogOpen(true);
  };

  // Handle claim button click from detail dialog
  const handleClaimClick = () => {
    if (detailServer) {
      setClaimServer({
        uuid: detailServer.uuid || detailServer.external_id, // Use external_id as fallback
        name: detailServer.name,
        template: {
          command: detailServer.command,
          args: detailServer.args,
          env: detailServer.env,
        }
      });
      setClaimDialogOpen(true);
      setDetailDialogOpen(false); // Close detail dialog
    }
  };



  // Helper to check if server is owned by current user
  const isOwnServer = (item: any) => {
    // Registry servers are never "owned" by users in the UI context
    // They are public registry entries that anyone can use
    if (item.source === McpServerSource.REGISTRY) {
      return false;
    }
    
    // Community servers are owned if shared by current user
    return item.shared_by === currentUsername;
  };

  // Handle unshare click
  const handleUnshareClick = async (item: any) => {
    if (!profileUuid) {
      toast({
        title: t('common.error'),
        description: t('search.error.profileNotFound'), // Need this translation key
        variant: 'destructive',
      });
      return;
    }
    // For community servers, external_id contains the shared server UUID
    const sharedServerUuid = item.source === McpServerSource.COMMUNITY ? item.external_id : item.shared_uuid;
    if (!sharedServerUuid) {
       toast({
         title: t('common.error'),
         description: t('search.error.missingShareId'),
         variant: 'destructive',
       });
       return;
    }

    try {
      const result = await unshareServer(profileUuid, sharedServerUuid);
      if (result.success) {
        toast({
          title: t('common.success'),
          description: t('search.unshareSuccess', { name: item.name }), // Need this translation key
        });
        // Add a small delay before refreshing to allow the search index to update
        setTimeout(() => {
          onRefreshNeeded?.(); // Refresh the search results
        }, 500);
      } else {
        throw new Error(result.error || t('search.error.unshareFailed')); // Need this translation key
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('search.error.unshareFailed'),
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
        {Object.entries(items).map(([key, item]) => {
          // Check if the server is installed
          const installedUuid = item.source && item.external_id
            ? installedServerMap.get(`${item.source}:${item.external_id}`)
            : undefined;

          const isOwned = isOwnServer(item);
          const isSelected = selectedItems.includes(key);
          const isInstalled = Boolean(installedUuid);

          return (
            <UnifiedServerCard
              key={key}
              server={item}
              serverKey={key}
              isInstalled={isInstalled}
              isOwned={isOwned}
              selectable={selectable}
              isSelected={isSelected}
              onInstallClick={handleInstallClick}
              onRateClick={handleRateClick}
              onViewDetailsClick={handleViewDetailsClick}
              onUnshareClick={handleUnshareClick}
              onItemSelect={onItemSelect}
              onReviewsClick={handleReviewsClick}
            />
          );
        })}
      </div>

      {selectedServer && (
        <InstallDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          serverData={selectedServer}
        />
      )}
      
      {rateServer && (
        <RateServerDialog
          open={rateDialogOpen}
          onOpenChange={setRateDialogOpen}
          serverData={rateServer}
          onRatingSubmitted={onRefreshNeeded}
        />
      )}

      {/* Render the Reviews Dialog */}
      {reviewServer && (
        <ReviewsDialog
          open={reviewsDialogOpen}
          onOpenChange={setReviewsDialogOpen}
          serverData={reviewServer}
        />
      )}

      {/* Server Detail Dialog */}
      {detailServer && (
        <ServerDetailDialog
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          server={detailServer}
          canDelete={false}
          onClaim={handleClaimClick}
        />
      )}

      {/* Claim Server Dialog */}
      {claimServer && (
        <ClaimServerDialog
          open={claimDialogOpen}
          onOpenChange={setClaimDialogOpen}
          server={claimServer}
        />
      )}

      {/* Auth Dialog */}
      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('auth:loginRequired', 'Login Required')}</DialogTitle>
            <DialogDescription>
              {authDialogMessage ? t(authDialogMessage.key, authDialogMessage.defaultMsg) : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="default"
              onClick={() => {
                setShowAuthDialog(false);
                signIn();
              }}
            >
              {t('auth:login', 'Login')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowAuthDialog(false);
                window.location.href = '/auth/register';
              }}
            >
              {t('auth:register', 'Register')}
            </Button>
            <DialogClose asChild>
              <Button variant="ghost">{t('common.cancel', 'Cancel')}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
}
