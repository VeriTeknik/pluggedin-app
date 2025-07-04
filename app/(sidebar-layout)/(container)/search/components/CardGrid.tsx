'use client';

import { Award, Database, Download, Eye, Github, MessageCircle, Package, Star, ThumbsUp, Trash2, UserPlus, Users } from 'lucide-react'; // Sorted alphabetically
import * as LucideIcons from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { unshareServer } from '@/app/actions/social'; // Import unshare action
import { ServerDetailDialog } from '@/components/server-detail-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { useAnalytics } from '@/hooks/use-analytics';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast'; // Import useToast
import { McpServerCategory, SearchIndex } from '@/types/search';
import { getCategoryIcon } from '@/utils/categories';

import { ClaimServerDialog } from './ClaimServerDialog';
import { InstallDialog } from './InstallDialog';
import { RateServerDialog } from './RateServerDialog';
import { ReviewsDialog } from './ReviewsDialog'; // Import the new dialog

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

// Helper function to get category badge
function CategoryBadge({ category }: { category?: McpServerCategory }) {
  const { t } = useTranslation();
  
  if (!category) {
    return null;
  }
  
  const iconName = getCategoryIcon(category);
  const IconComponent = (LucideIcons as Record<string, any>)[iconName];
  
  return (
    <Badge variant="secondary" className="gap-1">
      {IconComponent && <IconComponent className="h-3 w-3" />}
      {t(`search.categories.${category}`)}
    </Badge>
  );
}

// Helper function to get source icon
function SourceBadge({ source }: { source?: McpServerSource }) {
  const { t: _t } = useTranslation();
  
  switch (source) {
    case McpServerSource.REGISTRY:
      return (
        <Badge variant="default" className="gap-1 whitespace-normal text-center h-auto py-1 bg-blue-600 hover:bg-blue-700">
          <Package className="h-3 w-3 flex-shrink-0" />
          <span className="inline-block">Registry</span>
        </Badge>
      );
    case McpServerSource.SMITHERY:
      return (
        <Badge variant="outline" className="gap-1 whitespace-normal text-center h-auto py-1">
          <Database className="h-3 w-3 flex-shrink-0" />
          <span className="inline-block">Smithery</span>
        </Badge>
      );
    case McpServerSource.NPM:
      return (
        <Badge variant="outline" className="gap-1 whitespace-normal text-center h-auto py-1">
          <Package className="h-3 w-3 flex-shrink-0" />
          <span className="inline-block">NPM</span>
        </Badge>
      );
    case McpServerSource.GITHUB:
      return (
        <Badge variant="outline" className="gap-1 whitespace-normal text-center h-auto py-1">
          <Github className="h-3 w-3 flex-shrink-0" />
          <span className="inline-block">GitHub</span>
        </Badge>
      );
    case McpServerSource.COMMUNITY:
      return (
        <Badge variant="outline" className="gap-1 whitespace-normal text-center h-auto py-1 bg-blue-100 dark:bg-blue-900">
          <Users className="h-3 w-3 flex-shrink-0" />
          <span className="inline-block">Community</span>
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1 whitespace-normal text-center h-auto py-1">
          <Database className="h-3 w-3 flex-shrink-0" />
          <span className="inline-block">PluggedIn</span>
        </Badge>
      );
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
  const { track } = useAnalytics();
  const { isAuthenticated, signIn } = useAuth();
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [authDialogMessage, setAuthDialogMessage] = useState<{ key: string; defaultMsg: string } | null>(null);
  const [trackedViews, setTrackedViews] = useState<Set<string>>(new Set());

  // Track views for all visible servers
  useEffect(() => {
    const visibleServers = Object.entries(items);
    const newViews: string[] = [];

    visibleServers.forEach(([key, item]) => {
      // Create a unique ID for this server
      const serverId = item.external_id || key;
      
      // Only track if we haven't tracked this view yet
      if (!trackedViews.has(serverId)) {
        newViews.push(serverId);
        
        // Track the view event
        track({
          type: 'view',
          serverId,
          source: 'search',
        });
      }
    });

    // Update tracked views
    if (newViews.length > 0) {
      setTrackedViews(prev => new Set([...prev, ...newViews]));
    }
  }, [items, track, trackedViews]);

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
  const [claimServer, setClaimServer] = useState<{
    uuid: string;
    name: string;
    template?: any;
  } | null>(null);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);

  // Check for saved claim state on mount (for returning from OAuth)
  useEffect(() => {
    const savedState = localStorage.getItem('claim_server_state');
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        // Find the server in the current items
        const serverEntry = Object.entries(items).find(([_key, item]) => 
          item.uuid === state.serverUuid || 
          (item.source === McpServerSource.COMMUNITY && item.name === state.serverName)
        );
        
        if (serverEntry) {
          const [_key, item] = serverEntry;
          // Re-open the claim dialog with the server
          setClaimServer({
            uuid: item.uuid || state.serverUuid,
            name: item.name,
            template: item.template || {
              command: item.command,
              args: item.args ? item.args.split(' ') : [],
              env: item.env,
              type: item.type,
            }
          });
          setClaimDialogOpen(true);
        }
      } catch (e) {
        console.error('Error restoring claim state:', e);
      }
    }
  }, [items]);

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
    
    // Track detail view
    const serverId = item.external_id || item.name;
    track({
      type: 'view',
      serverId,
      source: 'detail',
    });
    
    // Debug logging
    console.log('[CardGrid] handleViewDetailsClick - item data:', {
      name: item.name,
      command: item.command,
      args: item.args,
      envs: item.envs,
      source: item.source,
      external_id: item.external_id
    });
    
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
    });
    setDetailDialogOpen(true);
  };


  // Helper to format ratings
  const formatRating = (rating?: number, count?: number) => {
    // Use ratingCount (consistent with McpIndex type and renderCommunityInfo)
    if (rating === undefined || rating === null || !count) { 
      return null;
    }
    
    // Convert rating to number before using toFixed
    const numericRating = typeof rating === 'string' ? parseFloat(rating) : rating;
    
    // Check if conversion was successful and it's a valid number
    if (isNaN(numericRating)) {
      return null; 
    }
    
    return (
      <div className="flex items-center">
        <Star className="h-3 w-3 mr-1 fill-yellow-400 text-yellow-400" />
        {numericRating.toFixed(1)} ({count})
      </div>
    );
  };

  // Shows meta data for community cards
  const renderCommunityInfo = (item: any) => {
    if (item.source !== McpServerSource.COMMUNITY) return null;
    
    // Don't show if there's no shared_by
    if (!item.shared_by) return null;
    
    return (
      <div className="text-xs text-muted-foreground mt-2 border-t pt-2">
        {item.shared_by && (
          <div className="flex items-center mt-1">
            <Users className="h-3 w-3 mr-1" />
            Shared by:{' '}
            {item.shared_by_profile_url ? (
              <Link 
                href={item.shared_by_profile_url}
                className="hover:underline ml-1"
              >
                {item.shared_by}
              </Link>
            ) : (
              <span className="ml-1">{item.shared_by}</span>
            )}
          </div>
        )}
        {/* Make review count clickable */}
        {item.ratingCount && item.ratingCount > 0 && (
           <button
             className="flex items-center mt-1 hover:underline cursor-pointer text-left"
             onClick={() => handleReviewsClick(item)}
             aria-label={`View ${item.ratingCount} reviews for ${item.name}`}
           >
            <MessageCircle className="h-3 w-3 mr-1" />
            {item.ratingCount} {item.ratingCount === 1 ? 'review' : 'reviews'}
          </button>
        )}
      </div>
    );
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
          <Card 
            key={key} 
            className={`flex flex-col cursor-pointer transition-all hover:shadow-lg ${selectable && !isInstalled ? 'hover:border-primary' : ''} ${isSelected ? 'ring-2 ring-primary' : ''} ${isInstalled ? 'opacity-70' : ''}`}
            onClick={(e) => {
              // Don't trigger if clicking on interactive elements
              const target = e.target as HTMLElement;
              if (target.closest('button, a')) return;
              
              if (selectable && !isInstalled && onItemSelect) {
                onItemSelect(key, !isSelected);
              } else {
                // If not in selection mode, show details
                handleViewDetailsClick(e, item);
              }
            }}
          >
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                <CardTitle className="mr-2 break-words">{item.name}</CardTitle>
                <div className="flex flex-wrap items-center gap-2 mt-1 sm:mt-0">
                  {isInstalled && (
                    <Badge variant="secondary" className="pointer-events-none whitespace-normal text-center h-auto py-1">
                      <span className="inline-block">Installed</span>
                    </Badge>
                  )}
                  <SourceBadge source={item.source} />
                  {item.source === McpServerSource.COMMUNITY && item.is_claimed && (
                    <Badge variant="secondary" className="gap-1">
                      <Award className="h-3 w-3" />
                      <span>Claimed</span>
                    </Badge>
                  )}
                </div>
              </div>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent className='flex-grow pb-2'>
              {item.package_name && (
                <p className='text-sm text-muted-foreground mb-2 overflow-wrap-normal break-words'>
                  {t('search.card.package')}: {item.package_name}
                </p>
              )}
              {item.command && (
                <p className='text-sm text-muted-foreground mb-2 overflow-wrap-normal break-words'>
                  {t('search.card.command')}: {item.command}
                </p>
              )}
              {item.args?.length > 0 && (
                <p className='text-sm text-muted-foreground mb-2 overflow-wrap-normal break-words'>
                  {t('search.card.exampleArgs')}: {item.args.join(' ')}
                </p>
              )}
              
              <div className="flex flex-wrap gap-2 mt-2">
                {item.category && (
                  <CategoryBadge category={item.category} />
                )}
                
                {item.envs?.map((env) => (
                  <Badge 
                    key={typeof env === 'string' ? env : env.name} 
                    variant='secondary'
                  >
                    {typeof env === 'string' ? env : env.name}
                  </Badge>
                ))}
                
                {item.tags?.map((tag: string) => (
                  <Badge key={tag} variant='outline'>
                    {tag}
                  </Badge>
                ))}
              </div>
              
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                {item.useCount !== undefined && (
                  <div className="flex items-center">
                    <Database className="h-3 w-3 mr-1" />
                    {t('search.card.usageCount')}: {item.useCount}
                  </div>
                )}
                
            {formatRating(item.rating, item.ratingCount)}

            {/* Display Installation Count */}
            {item.installation_count !== undefined && item.installation_count > 0 && (
              <div className="flex items-center">
                <UserPlus className="h-3 w-3 mr-1" />
                {item.installation_count}
              </div>
            )}

            {item.github_stars !== undefined && item.github_stars !== null && (
                  <div className="flex items-center">
                    <Github className="h-3 w-3 mr-1" />
                    {item.github_stars}
                  </div>
                )}
                
                {item.package_download_count !== undefined && item.package_download_count !== null && (
                  <div className="flex items-center">
                    <Download className="h-3 w-3 mr-1" />
                    {item.package_download_count}
                  </div>
                )}
              </div>

              {/* Add community-specific information */}
              {renderCommunityInfo(item)}
            </CardContent>
            <CardFooter className='flex flex-wrap gap-2 justify-between pt-2'>
              <div className='flex gap-2'>
                {/* View Details button */}
                <Button 
                  variant='outline' 
                  size="sm"
                  onClick={(e) => handleViewDetailsClick(e, item)}
                >
                  <Eye className='w-4 h-4 mr-2' />
                  Details
                </Button>
                
                {item.githubUrl && (
                  <Button variant='outline' asChild size="sm">
                    <Link
                      href={item.githubUrl}
                      target='_blank'
                      rel='noopener noreferrer'>
                      <Github className='w-4 h-4 mr-2' />
                      GitHub
                    </Link>
                  </Button>
                )}
              </div>
              
              <div className='flex gap-2'>
                {/* Only show rate button if not user's own server */}
                {item.source && item.external_id && !isOwned && (
                  <Button 
                    variant='outline' 
                    size="sm"
                    className="gap-1"
                    onClick={() => handleRateClick(key, item)}
                  >
                    <ThumbsUp className='w-4 h-4' />
                    {t('search.card.rate')}
                  </Button>
                )}
                
                {isOwned ? (
                  // Show Unshare button for owned servers
                  <Button
                    variant='destructive'
                    size="sm"
                    onClick={() => handleUnshareClick(item)}
                  >
                    <Trash2 className='w-4 h-4 mr-2' />
                    Unshare
                  </Button>
                ) : item.source === McpServerSource.COMMUNITY && !item.is_claimed && item.external_id ? (
                  // Show claim button for unclaimed community servers
                  <Button
                    variant='outline'
                    size="sm"
                    onClick={() => {
                      if (!requireAuth('auth:loginToClaim', 'You must be logged in to claim servers.')) return;
                      if (!item.external_id) {
                        toast({
                          title: 'Error',
                          description: 'Cannot claim server: Missing server ID',
                          variant: 'destructive',
                        });
                        return;
                      }
                      setClaimServer({
                        uuid: item.external_id,
                        name: item.name,
                        template: {
                          command: item.command,
                          args: item.args,
                          env: item.envs,
                          url: item.url,
                          type: (item.command ? McpServerType.STDIO : item.url ? McpServerType.SSE : McpServerType.STDIO),
                        }
                      });
                      setClaimDialogOpen(true);
                    }}
                  >
                    <Award className='w-4 h-4 mr-2' />
                    {t('search.card.claim', 'Claim')}
                  </Button>
                ) : isInstalled ? ( // Check if installed first
                  // Render disabled "Installed" button if installed
                  <Button variant='outline' size="sm" disabled className="pointer-events-none">
                    {t('search.card.installed')}
                  </Button>
                ) : ( 
                  // If not owned AND not installed, render Install button
                  <Button
                    variant='default'
                    size="sm"
                    onClick={() => handleInstallClick(key, item)}
                  >
                    <Download className='w-4 h-4 mr-2' />
                    {t('search.card.install')}
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>
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

      {/* Claim Server Dialog */}
      {claimServer && (
        <ClaimServerDialog
          open={claimDialogOpen}
          onOpenChange={(open) => {
            setClaimDialogOpen(open);
            // If dialog is closing and we have a refresh callback, call it
            if (!open && onRefreshNeeded) {
              // Add a small delay to allow the backend to update
              setTimeout(() => {
                onRefreshNeeded();
              }, 1000);
            }
          }}
          server={claimServer}
        />
      )}
    </>
  );
}
