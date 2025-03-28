import { Database, Download, Github, Package, Star, ThumbsUp, UserPlus } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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
import { McpServerSource, McpServerType } from '@/db/schema';
import { McpServerCategory, SearchIndex } from '@/types/search';
import { getCategoryIcon } from '@/utils/categories';

import { InstallDialog } from './InstallDialog';
// Temporarily disable the rating dialog until we fix the import issue
// import { RateServerDialog } from './RateServerDialog';

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
    case McpServerSource.SMITHERY:
      return (
        <Badge variant="outline" className="gap-1">
          <Database className="h-3 w-3" />
          Smithery
        </Badge>
      );
    case McpServerSource.NPM:
      return (
        <Badge variant="outline" className="gap-1">
          <Package className="h-3 w-3" />
          NPM
        </Badge>
      );
    case McpServerSource.GITHUB:
      return (
        <Badge variant="outline" className="gap-1">
          <Github className="h-3 w-3" />
          GitHub
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <Database className="h-3 w-3" />
          PluggedIn
        </Badge>
      );
  }
}

export default function CardGrid({ items, installedServerMap }: { items: SearchIndex; installedServerMap: Map<string, string> }) {
  const { t: _t } = useTranslation();
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
  const [_rateServer, setRateServer] = useState<{
    name: string;
    source?: McpServerSource;
    external_id?: string;
  } | null>(null);
  const [_rateDialogOpen, setRateDialogOpen] = useState(false);

  const handleInstallClick = (key: string, item: any) => {
    // Determine if this is a stdio or SSE server
    const isSSE = item.url || false;
    
    setSelectedServer({
      name: item.name,
      description: item.description,
      command: isSSE ? '' : item.command,
      args: isSSE ? '' : item.args?.join(' ') || '',
      env: isSSE ? '' : item.envs?.map((env: string) => env).join('\n') || '',
      url: isSSE ? item.url : undefined,
      type: isSSE ? McpServerType.SSE : McpServerType.STDIO,
      source: item.source,
      external_id: item.external_id,
    });
    
    setDialogOpen(true);
  };

  // Handle clicking the rate button
  const handleRateClick = (key: string, item: any) => {
    setRateServer({
      name: item.name,
      source: item.source,
      external_id: item.external_id,
    });
    
    setRateDialogOpen(true);
  };

  // Helper to format ratings
  const formatRating = (rating?: number, count?: number) => {
    if (!rating || !count) {
      return null;
    }
    
    return (
      <div className="flex items-center">
        <Star className="h-3 w-3 mr-1 fill-yellow-400 text-yellow-400" />
        {rating.toFixed(1)} ({count})
      </div>
    );
  };

  return (
    <>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
        {Object.entries(items).map(([key, item]) => {
          // Check if the server is installed
          const installedUuid = item.source && item.external_id
            ? installedServerMap.get(`${item.source}:${item.external_id}`)
            : undefined;

          return (
          <Card key={key} className='flex flex-col'>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="mr-2">{item.name}</CardTitle>
                <SourceBadge source={item.source} />
              </div>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent className='flex-grow pb-2'>
              {item.package_name && (
                <p className='text-sm text-muted-foreground mb-2'>
                  {_t('search.card.package')}: {item.package_name}
                </p>
              )}
              {item.command && (
                <p className='text-sm text-muted-foreground mb-2'>
                  {_t('search.card.command')}: {item.command}
                </p>
              )}
              {item.args?.length > 0 && (
                <p className='text-sm text-muted-foreground mb-2'>
                  {_t('search.card.exampleArgs')}: {item.args.join(' ')}
                </p>
              )}
              
              <div className="flex flex-wrap gap-2 mt-2">
                {item.category && (
                  <CategoryBadge category={item.category} />
                )}
                
                {item.envs?.map((env: string) => (
                  <Badge key={env} variant='secondary'>
                    {env}
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
                    {_t('search.card.usageCount')}: {item.useCount}
                  </div>
                )}
                
                {formatRating(item.rating, item.rating_count)}
                
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
            </CardContent>
            <CardFooter className='flex justify-between pt-2'>
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
              
              {item.source && item.external_id && (
                <Button 
                  variant='outline' 
                  size="sm"
                  className="gap-1"
                  onClick={() => handleRateClick(key, item)}
                >
                  <ThumbsUp className='w-4 h-4' />
                  Rate
                </Button>
              )}
              
              {installedUuid ? (
                  // Render Edit button if installed
                  <Button variant='secondary' size="sm" asChild>
                    <Link href={`/mcp-servers/${installedUuid}`}>
                      <LucideIcons.Edit className='w-4 h-4 mr-2' />
                      {_t('search.card.edit')}
                    </Link>
                  </Button>
                ) : (
                  // Render Install button if not installed
                  <Button
                    variant='default'
                    size="sm"
                    onClick={() => handleInstallClick(key, item)}>
                    <Download className='w-4 h-4 mr-2' />
                    {_t('search.card.install')}
                  </Button>
                )}
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
      
      {/* Temporarily disable the rating dialog until we fix the import issue 
      {_rateServer && (
        <RateServerDialog
          open={_rateDialogOpen}
          onOpenChange={setRateDialogOpen}
          serverData={_rateServer}
        />
      )} */}
    </>
  );
}
