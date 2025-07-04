'use client';

import { AlertCircle, BarChart3, Code2, ExternalLink, GitBranch, Globe, Info, Loader2, MessageSquare, Package, Server, Star, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { fetchRegistryServer } from '@/app/actions/registry-servers';
import { EnvVarsEditor } from '@/components/env-vars-editor';
import { ServerReviewsList } from '@/components/server-reviews-list';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { McpServerSource, McpServerType } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';

interface ServerDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: {
    name: string;
    type: McpServerType;
    description?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    source?: McpServerSource;
    external_id?: string;
    repositoryUrl?: string;
    // Stats fields
    rating?: number;
    ratingCount?: number;
    installation_count?: number;
    // Registry-specific fields
    registryData?: {
      id: string;
      name: string;
      description?: string;
      author?: string;
      license?: string;
      homepage?: string;
      repository?: string;
      version?: string;
      downloads?: number;
      stars?: number;
      created_at?: string;
      updated_at?: string;
      tags?: string[];
      readme?: string;
    };
  };
  onDelete?: () => void;
  canDelete?: boolean;
  onUpdate?: (updatedServer: any) => void;
}

export function ServerDetailDialog({
  open,
  onOpenChange,
  server,
  onDelete,
  canDelete = true,
  onUpdate,
}: ServerDetailDialogProps) {
  const { t } = useTranslation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState('configuration'); // Default to configuration tab
  const [registryData, setRegistryData] = useState(server.registryData);
  const [isLoadingRegistry, setIsLoadingRegistry] = useState(false);
  const [editableEnv, setEditableEnv] = useState(server.env || {});
  const [fullServerData, setFullServerData] = useState<any>(null);
  const { session } = useAuth();

  // Reset editableEnv when server changes
  useEffect(() => {
    if (open) {
      setEditableEnv(server.env || {});
      setActiveTab('configuration'); // Always open configuration tab
    }
  }, [open, server.env]);

  // Fetch registry data if server is from registry
  useEffect(() => {
    async function loadRegistryData() {
      if (open && server.source === McpServerSource.REGISTRY && server.external_id) {
        setIsLoadingRegistry(true);
        try {
          // Fetch full server details from the API which includes command/args
          const response = await fetch(`/api/registry/server/${server.external_id}`);
          const apiData = await response.json();
          
          if (apiData.success && apiData.server) {
            // Set the full server data which includes command/args
            setFullServerData(apiData.server);
            
            // Also update env if we have environment variables
            if (apiData.server.envs && Array.isArray(apiData.server.envs)) {
              const envObj: Record<string, string> = {};
              apiData.server.envs.forEach((env: any) => {
                if (typeof env === 'string') {
                  envObj[env] = '';
                } else if (env.name) {
                  envObj[env.name] = env.description || '';
                }
              });
              setEditableEnv(envObj);
            }
          }
          
          // Also fetch registry-specific data if not already present
          if (!server.registryData) {
            const result = await fetchRegistryServer(server.external_id);
            if (result.success && result.data) {
              const data = result.data;
              setRegistryData({
                id: data.id,
                name: data.name,
                description: data.description,
                repository: data.repository?.url,
                version: data.version_detail?.version,
                author: data.repository?.id ? data.repository.id.split('/')[0] : undefined,
                homepage: data.repository?.url,
                tags: data.tags || [],
                created_at: data.created_at,
                updated_at: data.version_detail?.release_date,
                downloads: data.downloads,
                stars: data.stars,
              });
            }
          }
        } catch (error) {
          console.error('Failed to fetch registry data:', error);
        } finally {
          setIsLoadingRegistry(false);
        }
      }
    }
    loadRegistryData();
  }, [open, server.source, server.external_id]);

  // Don't allow deletion of registry servers
  const isDeletable = canDelete && server.source !== McpServerSource.REGISTRY;

  const handleDelete = () => {
    if (onDelete) {
      onDelete();
      onOpenChange(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const formatNumber = (num?: number) => {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-2xl flex items-center gap-2">
                <Server className="h-6 w-6" />
                {server.name}
              </DialogTitle>
              <DialogDescription className="mt-2">
                {server.description || 'No description available'}
              </DialogDescription>
            </div>
            {isDeletable && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDeleteConfirm(true)}
                className="ml-4"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-2 mt-4">
            <Badge variant="outline">
              {server.type}
            </Badge>
            {server.source === McpServerSource.REGISTRY && (
              <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
                <Package className="h-3 w-3 mr-1" />
                Registry
              </Badge>
            )}
            {server.source === McpServerSource.GITHUB && (
              <Badge variant="outline">
                <GitBranch className="h-3 w-3 mr-1" />
                GitHub
              </Badge>
            )}
            {server.source === McpServerSource.COMMUNITY && (
              <Badge variant="secondary">
                <Users className="h-3 w-3 mr-1" />
                Community
              </Badge>
            )}
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="reviews">
              <MessageSquare className="h-4 w-4 mr-2" />
              Reviews
            </TabsTrigger>
            <TabsTrigger value="analytics" disabled>
              Analytics
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 h-[500px] mt-4">
            <TabsContent value="overview" className="space-y-4">
              {/* Registry Information */}
              {isLoadingRegistry && (
                <Card>
                  <CardContent className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span>Loading registry information...</span>
                  </CardContent>
                </Card>
              )}
              
              {registryData && !isLoadingRegistry && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Registry Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Author</p>
                        <p className="font-medium">{registryData.author || 'Unknown'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">License</p>
                        <p className="font-medium">{registryData.license || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Version</p>
                        <p className="font-medium">{registryData.version || 'Latest'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Downloads</p>
                        <p className="font-medium">{formatNumber(registryData.downloads)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Stars</p>
                        <p className="font-medium">{formatNumber(registryData.stars)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Last Updated</p>
                        <p className="font-medium">{formatDate(registryData.updated_at)}</p>
                      </div>
                      {server.rating !== undefined && server.ratingCount !== undefined && (
                        <>
                          <div>
                            <p className="text-sm text-muted-foreground">Rating</p>
                            <div className="flex items-center gap-1">
                              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                              <span className="font-medium">{server.rating.toFixed(1)}</span>
                              <span className="text-sm text-muted-foreground">({server.ratingCount})</span>
                            </div>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Installations</p>
                            <p className="font-medium">{formatNumber(server.installation_count || 0)}</p>
                          </div>
                        </>
                      )}
                    </div>

                    {registryData.tags && registryData.tags.length > 0 && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-2">Tags</p>
                        <div className="flex flex-wrap gap-2">
                          {registryData.tags.map((tag) => (
                            <Badge key={tag} variant="secondary">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {registryData.homepage && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={registryData.homepage} target="_blank" rel="noopener noreferrer">
                            <Globe className="h-4 w-4 mr-2" />
                            Homepage
                          </a>
                        </Button>
                      )}
                      {registryData.repository && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={registryData.repository} target="_blank" rel="noopener noreferrer">
                            <GitBranch className="h-4 w-4 mr-2" />
                            Repository
                          </a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* GitHub Information */}
              {server.repositoryUrl && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <GitBranch className="h-5 w-5" />
                      Source Repository
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" size="sm" asChild>
                      <a href={server.repositoryUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View on GitHub
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Server Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Info className="h-5 w-5" />
                    Server Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Type</p>
                    <p className="font-medium">{server.type}</p>
                  </div>
                  {server.external_id && (
                    <div>
                      <p className="text-sm text-muted-foreground">External ID</p>
                      <p className="font-mono text-sm">{server.external_id}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Source</p>
                    <p className="font-medium">{server.source || 'Local'}</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="configuration" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Code2 className="h-5 w-5" />
                    Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(fullServerData?.command || server.command) && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Command</p>
                      <code className="block p-3 bg-muted rounded-md text-sm">
                        {fullServerData?.command || server.command}
                      </code>
                    </div>
                  )}

                  {((fullServerData?.args && fullServerData.args.length > 0) || (server.args && server.args.length > 0)) && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Arguments</p>
                      <code className="block p-3 bg-muted rounded-md text-sm">
                        {(fullServerData?.args || server.args || []).join(' ')}
                      </code>
                    </div>
                  )}

                  {(fullServerData?.url || server.url) && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">URL</p>
                      <code className="block p-3 bg-muted rounded-md text-sm break-all">
                        {fullServerData?.url || server.url}
                      </code>
                    </div>
                  )}

                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Environment Variables</p>
                    <EnvVarsEditor
                      value={Object.entries(editableEnv)
                        .map(([key, value]) => `${key}="${value}"`)
                        .join('\n')}
                      onChange={(newValue: string) => {
                        // Parse the new env vars
                        const newEnv: Record<string, string> = {};
                        const lines = newValue.split('\n');
                        lines.forEach((line: string) => {
                          const match = line.trim().match(/^([^=]+)=(.*)$/);
                          if (match) {
                            newEnv[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
                          }
                        });
                        setEditableEnv(newEnv);
                        // Update parent if callback provided
                        if (onUpdate) {
                          onUpdate({ ...server, env: newEnv });
                        }
                      }}
                    />
                  </div>

                  {/* Full Configuration JSON */}
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Full Configuration</p>
                    <pre className="p-3 bg-muted rounded-md text-sm overflow-x-auto">
                      {JSON.stringify(
                        {
                          name: fullServerData?.name || server.name,
                          type: fullServerData?.url ? McpServerType.SSE : server.type,
                          description: fullServerData?.description || server.description,
                          command: fullServerData?.command || server.command,
                          args: fullServerData?.args || server.args,
                          env: editableEnv,
                          url: fullServerData?.url || server.url,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="reviews" className="space-y-4">
              {/* Reviews section */}
              {server.source === McpServerSource.REGISTRY && server.external_id ? (
                <ServerReviewsList 
                  serverId={server.external_id}
                  source={server.source}
                  currentUserId={session?.user?.id}
                />
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">{t('reviews.notAvailable', 'Reviews not available')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('reviews.registryOnly', 'Reviews are only available for registry servers')}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="analytics" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Analytics
                  </CardTitle>
                  <CardDescription>
                    Server usage analytics and statistics will be available here soon.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Analytics features are coming soon. You&apos;ll be able to see:
                      <ul className="list-disc list-inside mt-2">
                        <li>Usage statistics and frequency</li>
                        <li>Performance metrics</li>
                        <li>Error rates and debugging information</li>
                        <li>Tool usage breakdown</li>
                        <li>Historical trends</li>
                      </ul>
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        {showDeleteConfirm && (
          <Alert className="mt-4 border-destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <span>Are you sure you want to delete this server?</span>
                <div className="flex gap-2 ml-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleDelete}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}