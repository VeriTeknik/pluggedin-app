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
    } else {
      setIsExpanded(!isExpanded);
    }
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
    >
      <Card
        className={cn(
          "relative overflow-hidden transition-all duration-200",
          "hover:shadow-lg dark:hover:shadow-primary/5",
          selectable && !isInstalled && "hover:border-primary cursor-pointer",
          isSelected && "ring-2 ring-primary",
          isInstalled && "opacity-80",
          isExpanded && "md:col-span-2 lg:col-span-3"
        )}
        onClick={handleCardClick}
      >
        {/* Main Card Content */}
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg break-words flex items-center gap-2">
                {server.name}
                {isInstalled && (
                  <Badge variant="secondary" className="text-xs">
                    Installed
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-1 line-clamp-2">
                {server.description}
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <SourceBadge source={server.source} />
              {server.category && <CategoryBadge category={server.category} />}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pb-3">
          {/* Key Stats - Only show if meaningful */}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {formatRating(server.rating, server.ratingCount)}
            
            {server.installation_count !== undefined && server.installation_count > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <UserPlus className="h-4 w-4" />
                <span>{server.installation_count} installs</span>
              </div>
            )}
            
            {server.github_stars !== undefined && server.github_stars !== null && server.github_stars > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Github className="h-4 w-4" />
                <span>{server.github_stars} stars</span>
              </div>
            )}
            
            {/* Transport Type Badge */}
            <Badge variant="outline" className="gap-1">
              <Server className="h-3 w-3" />
              {transportType}
            </Badge>
          </div>
          
          {/* Expand/Collapse Button */}
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full"
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
        
        {/* Expanded Details Section */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <CardContent className="pt-0 pb-4">
                <Tabs defaultValue="overview" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 tabs-trigger">
                    <TabsTrigger value="overview">{t('search.card.tabs.overview')}</TabsTrigger>
                    <TabsTrigger value="technical">{t('search.card.tabs.technical')}</TabsTrigger>
                    <TabsTrigger value="community">{t('search.card.tabs.community')}</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="overview" className="mt-4 space-y-4">
                    {/* Full Description */}
                    <div>
                      <h4 className="text-sm font-medium mb-2">{t('search.card.description')}</h4>
                      <p className="text-sm text-muted-foreground">{server.description}</p>
                    </div>
                    
                    {/* Tags */}
                    {server.tags && server.tags.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">{t('search.card.tags')}</h4>
                        <div className="flex flex-wrap gap-2">
                          {server.tags.map((tag) => (
                            <Badge key={tag} variant="outline">
                              {tag}
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
                          <p>{t('search.card.package')}: {server.package_name}</p>
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
                  
                  <TabsContent value="technical" className="mt-4 space-y-4">
                    {/* Command/URL */}
                    <div>
                      <h4 className="text-sm font-medium mb-2">
                        {transportType === McpServerType.SSE ? t('search.card.url') : t('search.card.command')}
                      </h4>
                      <code className="block p-2 bg-muted rounded text-xs break-all">
                        {transportType === McpServerType.SSE ? server.url : server.command}
                      </code>
                    </div>
                    
                    {/* Arguments */}
                    {transportType === McpServerType.STDIO && server.args && server.args.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">{t('search.card.arguments')}</h4>
                        <code className="block p-2 bg-muted rounded text-xs break-all">
                          {server.args.join(' ')}
                        </code>
                      </div>
                    )}
                    
                    {/* Environment Variables */}
                    {formattedEnvs.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">{t('search.card.environmentVariables')}</h4>
                        <div className="space-y-2">
                          {formattedEnvs.map((env) => (
                            <div key={env.name} className="p-2 bg-muted rounded">
                              <code className="text-xs break-all">{env.name}=&lt;value&gt;</code>
                              {env.description && (
                                <p className="text-xs text-muted-foreground mt-1">{env.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="community" className="mt-4 space-y-4">
                    {/* Shared By */}
                    {server.shared_by && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">{t('search.card.sharedBy')}</h4>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          {server.shared_by_profile_url ? (
                            <Link
                              href={server.shared_by_profile_url}
                              className="text-sm hover:underline"
                              onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            >
                              {server.shared_by}
                            </Link>
                          ) : (
                            <span className="text-sm">{server.shared_by}</span>
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
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Card Footer - Action Buttons */}
        <CardFooter className="pt-3 flex flex-wrap gap-2 justify-between">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleViewDetails}
            >
              <Eye className="w-4 h-4 mr-2" />
              {t('search.card.details')}
            </Button>
            
            {server.githubUrl && (
              <Button variant="outline" size="sm" asChild>
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
          </div>
          
          <div className="flex gap-2">
            {/* Rate button - only show if not owned */}
            {server.source && server.external_id && !isOwned && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRate}
              >
                <Star className="w-4 h-4 mr-2" />
                {t('search.card.rate')}
              </Button>
            )}
            
            {/* Install/Unshare button */}
            {isOwned ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleUnshare}
              >
                {t('search.card.unshare')}
              </Button>
            ) : isInstalled ? (
              <Button variant="outline" size="sm" disabled>
                {t('search.card.installed')}
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={handleInstall}
              >
                <Download className="w-4 h-4 mr-2" />
                {t('search.card.install')}
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
}