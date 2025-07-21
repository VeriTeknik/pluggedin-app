'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Download, Eye, Github, Package, Server, Star, UserPlus, Users } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { McpServerSource, McpServerType } from '@/db/schema';
import { cn } from '@/lib/utils';
import { McpIndex, McpServerCategory } from '@/types/search';
import { getCategoryIcon } from '@/utils/categories';

interface UnifiedServerCardProps {
  server: McpIndex;
  serverKey: string;
  isInstalled: boolean;
  isOwned: boolean;
  selectable?: boolean;
  isSelected?: boolean;
  onInstallClick: (key: string, server: McpIndex) => void;
  onRateClick: (key: string, server: McpIndex) => void;
  onViewDetailsClick: (e: React.MouseEvent, server: McpIndex) => void;
  onUnshareClick?: (server: McpIndex) => void;
  onItemSelect?: (key: string, selected: boolean) => void;
  onReviewsClick: (server: McpIndex) => void;
}

// Helper function to get source badge
function SourceBadge({ source }: { source?: McpServerSource }) {
  switch (source) {
    case McpServerSource.REGISTRY:
      return (
        <Badge variant="default" className="gap-1 bg-blue-600 hover:bg-blue-700">
          <Package className="h-3 w-3" />
          Registry
        </Badge>
      );
    case McpServerSource.COMMUNITY:
      return (
        <Badge variant="outline" className="gap-1 bg-blue-100 dark:bg-blue-900">
          <Users className="h-3 w-3" />
          Community
        </Badge>
      );
    default:
      return null;
  }
}

// Helper function to get category badge
function CategoryBadge({ category }: { category?: McpServerCategory }) {
  const { t } = useTranslation();
  
  if (!category) return null;
  
  const iconName = getCategoryIcon(category);
  const IconComponent = (LucideIcons as Record<string, any>)[iconName];
  
  return (
    <Badge variant="secondary" className="gap-1">
      {IconComponent && <IconComponent className="h-3 w-3" />}
      {t(`search.categories.${category}`)}
    </Badge>
  );
}

// Helper function to format rating
function formatRating(rating?: number, count?: number) {
  if (!rating || !count) return null;
  
  const numericRating = typeof rating === 'string' ? parseFloat(rating) : rating;
  if (isNaN(numericRating)) return null;
  
  return (
    <div className="flex items-center gap-1">
      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
      <span className="font-medium">{numericRating.toFixed(1)}</span>
      <span className="text-muted-foreground">({count})</span>
    </div>
  );
}

// Helper function to format environment variables
function formatEnvVariables(envs: string[] | Array<{ name: string; description?: string }> | undefined): Array<{ name: string; description?: string }> {
  if (!envs || !Array.isArray(envs)) return [];
  
  if (envs.length === 0) return [];
  
  // Check if it's an array of strings or objects
  if (typeof envs[0] === 'string') {
    return (envs as string[]).map(env => ({ name: env }));
  }
  
  return envs as Array<{ name: string; description?: string }>;
}

export function UnifiedServerCard({
  server,
  serverKey,
  isInstalled,
  isOwned,
  selectable = false,
  isSelected = false,
  onInstallClick,
  onRateClick,
  onViewDetailsClick,
  onUnshareClick,
  onItemSelect,
  onReviewsClick,
}: UnifiedServerCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button, a, .tabs-trigger')) return;
    
    if (selectable && !isInstalled && onItemSelect) {
      onItemSelect(serverKey, !isSelected);
    }
    // Remove automatic expansion on card click to prevent UX issues
  };
  
  const handleInstall = (e: React.MouseEvent) => {
    e.stopPropagation();
    onInstallClick(serverKey, server);
  };
  
  const handleRate = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRateClick(serverKey, server);
  };
  
  const handleViewDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    onViewDetailsClick(e, server);
  };
  
  const handleUnshare = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUnshareClick?.(server);
  };
  
  const handleReviews = (e: React.MouseEvent) => {
    e.stopPropagation();
    onReviewsClick(server);
  };
  
  // Determine transport type
  const transportType = server.url ? McpServerType.SSE : McpServerType.STDIO;
  
  // Format environment variables
  const formattedEnvs = formatEnvVariables(server.envs);
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      <Card
        className={cn(
          "relative overflow-hidden transition-all duration-200 h-full flex",
          selectable && !isInstalled && "hover:border-primary cursor-pointer",
          isSelected && "ring-2 ring-primary",
          isInstalled && "opacity-80"
        )}
        onClick={handleCardClick}
      >
        {/* Main Card Content */}
        <AnimatePresence>
          {!isExpanded && (
            <motion.div
              initial={{ opacity: 1, x: 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: '-100%' }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="flex-1 flex flex-col min-w-0"
            >
              <CardHeader className="pb-3 flex-shrink-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg leading-tight flex items-center gap-2 mb-1">
                      <span className="truncate">{server.name}</span>
                      {isInstalled && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          Installed
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1 line-clamp-2 text-sm">
                      {server.description}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <SourceBadge source={server.source} />
                    {server.category && <CategoryBadge category={server.category} />}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pb-3 flex-1 flex flex-col">
                {/* Key Stats - Only show if meaningful */}
                <div className="flex flex-wrap items-center gap-3 text-sm mb-3">
                  {formatRating(server.rating, server.ratingCount)}
                  
                  {server.installation_count !== undefined && server.installation_count > 0 && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <UserPlus className="h-4 w-4 shrink-0" />
                      <span className="truncate">{server.installation_count} installs</span>
                    </div>
                  )}
                  
                  {server.github_stars !== undefined && server.github_stars !== null && server.github_stars > 0 && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Github className="h-4 w-4 shrink-0" />
                      <span className="truncate">{server.github_stars} stars</span>
                    </div>
                  )}
                  
                  {/* Transport Type Badge */}
                  <Badge variant="outline" className="gap-1 shrink-0">
                    <Server className="h-3 w-3" />
                    {transportType}
                  </Badge>
                </div>
                
                {/* Expand/Collapse Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mb-3 border-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded);
                  }}
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-2" />
                      {t('search.card.showLess')}
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-2" />
                      {t('search.card.showMore')}
                    </>
                  )}
                </Button>
              </CardContent>
              
              {/* Card Footer - Action Buttons */}
              <CardFooter className="pt-3 flex-shrink-0">
                <div className="flex flex-col gap-2 w-full">
                  {/* Main action buttons row */}
                  <div className="flex gap-2">
                    {/* Install/Unshare buttons */}
                    <div className="flex gap-2 flex-1">
                      {/* Show install button for everyone, including owners */}
                      {isInstalled ? (
                        <Button variant="outline" size="sm" disabled className="flex-1">
                          <span className="truncate">{t('search.card.installed')}</span>
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleInstall}
                          className="flex-1"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          <span className="truncate">{t('search.card.install')}</span>
                        </Button>
                      )}
                      
                      {/* Show unshare button only for owners */}
                      {isOwned && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleUnshare}
                          className="flex-1"
                        >
                          <span className="truncate">{t('search.card.unshare')}</span>
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* Secondary action buttons row */}
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleViewDetails}
                      className="w-full"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      <span className="truncate">{t('search.card.details')}</span>
                    </Button>
                    
                    {server.githubUrl && (
                      <Button variant="outline" size="sm" asChild className="w-full">
                        <Link
                          href={server.githubUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          <Github className="w-4 h-4 mr-2" />
                          GitHub
                        </Link>
                      </Button>
                    )}
                    
                    {/* Rate button - only show if not owned */}
                    {server.source && server.external_id && !isOwned && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRate}
                        className="w-full"
                      >
                        <Star className="w-4 h-4 mr-2" />
                        <span className="truncate">{t('search.card.rate')}</span>
                      </Button>
                    )}
                  </div>
                </div>
              </CardFooter>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Side Panel for Expanded Details */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, x: '100%' }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: '100%' }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="absolute inset-0 bg-background overflow-hidden"
            >
              <div className="w-full h-full overflow-y-auto">
                {/* Panel Header with Back Button and Close Button */}
                <div className="sticky top-0 bg-background border-b p-2 flex items-center justify-between z-10">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsExpanded(false);
                      }}
                      className="h-7 w-7 p-0 hover:bg-muted rounded-full flex-shrink-0"
                      title="Geri"
                    >
                      <svg 
                        className="h-4 w-4 text-muted-foreground hover:text-foreground" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </Button>
                    <h3 className="font-medium text-sm truncate">{t('search.card.moreDetails', 'More Details')}</h3>
                  </div>
                </div>
                
                {/* Panel Content with reduced padding */}
                <div className="p-2">
                  <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 h-9 mb-3 text-xs">
                      <TabsTrigger value="overview" className="text-xs px-2 py-1 min-w-0">
                        <span className="truncate">Overview</span>
                      </TabsTrigger>
                      <TabsTrigger value="technical" className="text-xs px-2 py-1 min-w-0">
                        <span className="truncate">Technical</span>
                      </TabsTrigger>
                      <TabsTrigger value="community" className="text-xs px-2 py-1 min-w-0">
                        <span className="truncate">Community</span>
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="overview" className="space-y-3 mt-0">
                      {/* Full Description */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">{t('search.card.description')}</h4>
                        <p className="text-sm text-muted-foreground break-words leading-relaxed">{server.description}</p>
                      </div>
                      
                      {/* Tags */}
                      {server.tags && server.tags.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">{t('search.card.tags')}</h4>
                          <div className="flex flex-wrap gap-1">
                            {server.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                <span className="truncate">{tag}</span>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Package Info */}
                      {server.package_name && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">{t('search.card.packageInfo')}</h4>
                          <div className="space-y-1 text-sm text-muted-foreground">
                            <p className="break-words">{t('search.card.package')}: {server.package_name}</p>
                            {server.package_registry && (
                              <p>{t('search.card.registry')}: {server.package_registry}</p>
                            )}
                            {server.package_download_count !== null && (
                              <p>{t('search.card.downloads')}: {server.package_download_count}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </TabsContent>
                    
                    <TabsContent value="technical" className="space-y-3 mt-0">
                      {/* Command/URL */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">
                          {transportType === McpServerType.SSE ? t('search.card.url') : t('search.card.command')}
                        </h4>
                        <code className="block p-2 bg-muted rounded-md text-xs break-all font-mono">
                          {transportType === McpServerType.SSE ? server.url : server.command}
                        </code>
                      </div>
                      
                      {/* Arguments */}
                      {transportType === McpServerType.STDIO && server.args && server.args.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">{t('search.card.arguments')}</h4>
                          <code className="block p-2 bg-muted rounded-md text-xs break-all font-mono">
                            {server.args.join(' ')}
                          </code>
                        </div>
                      )}
                      
                      {/* Environment Variables */}
                      {formattedEnvs.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">{t('search.card.environmentVariables')}</h4>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {formattedEnvs.map((env) => (
                              <div key={env.name} className="p-2 bg-muted rounded-md">
                                <code className="text-xs break-all font-mono">{env.name}=&lt;value&gt;</code>
                                {env.description && (
                                  <p className="text-xs text-muted-foreground mt-1 break-words">{env.description}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </TabsContent>
                    
                    <TabsContent value="community" className="space-y-3 mt-0">
                      {/* Shared By */}
                      {server.shared_by && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">{t('search.card.sharedBy')}</h4>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                            {server.shared_by_profile_url ? (
                              <Link
                                href={server.shared_by_profile_url}
                                className="text-sm hover:underline truncate"
                                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                              >
                                {server.shared_by}
                              </Link>
                            ) : (
                              <span className="text-sm truncate">{server.shared_by}</span>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Reviews */}
                      {server.ratingCount !== undefined && server.ratingCount > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">{t('search.card.reviews')}</h4>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={handleReviews}
                          >
                            {t('search.card.viewReviews', { count: server.ratingCount })}
                          </Button>
                        </div>
                      )}
                      
                      {/* Installation Stats */}
                      {server.installation_count !== undefined && server.installation_count > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">{t('search.card.installationStats')}</h4>
                          <p className="text-sm text-muted-foreground">
                            {t('search.card.installedByUsers', { count: server.installation_count })}
                          </p>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}