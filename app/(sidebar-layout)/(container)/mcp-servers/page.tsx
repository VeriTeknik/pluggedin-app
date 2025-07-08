'use client';

// React / Next imports
// Third-party library imports
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { Database, Download, Package, Settings, Share, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

// Internal actions
// import { getFirstApiKey } from '@/app/actions/api-keys'; // Removed unused import
import {
  bulkImportMcpServers,
  createMcpServer,
  deleteMcpServerByUuid,
  getMcpServers,
  toggleMcpServerStatus,
} from '@/app/actions/mcp-servers';
// Internal UI components
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
// Internal DB schema
import { McpServerStatus, McpServerType } from '@/db/schema';
// Internal hooks
import { useProfiles } from '@/hooks/use-profiles';
// import { useProjects } from '@/hooks/use-projects'; // Removed unused import
import { useToast } from '@/hooks/use-toast';
// Internal types
// import { ApiKey } from '@/types/api-key'; // Removed unused import
import { McpServer } from '@/types/mcp-server';

import { ServerCard } from './components/server-card';
// Local components
import { ExportDialog, ImportDialog } from './components/server-dialogs';
import { ServerHero } from './components/server-hero';
import { ServerStats } from './components/server-stats';
import { ShareCollectionDialog } from './components/share-collection-dialog';
import { SmartServerDialog } from './components/smart-server-dialog';


// Removed DiscoverToolsButton Component Definition


const columnHelper = createColumnHelper<McpServer>();
export default function MCPServersPage() {
  const { currentProfile } = useProfiles();
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportJson, setExportJson] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [shareCollectionOpen, setShareCollectionOpen] = useState(false);
  const [selectedServers, setSelectedServers] = useState<McpServer[]>([]);
  const [serverToDelete, setServerToDelete] = useState<McpServer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: servers = [], mutate } = useSWR(
    currentProfile?.uuid ? `${currentProfile.uuid}/mcp-servers` : null,
    () => getMcpServers(currentProfile?.uuid || '')
  );

  const columns = [
    columnHelper.accessor('name', {
      cell: (info) => info.getValue(),
      header: 'Name',
    }),
    columnHelper.accessor('description', {
      cell: (info) => info.getValue() || '-',
      header: 'Description',
    }),
    columnHelper.accessor('command', {
      cell: (info) => info.getValue() || '-',
      header: 'Command',
    }),
    columnHelper.accessor('args', {
      cell: (info) => info.getValue()?.join(' ') || '-',
      header: 'Arguments',
    }),
    columnHelper.accessor('type', {
      cell: (info) => info.getValue(),
      header: 'Type',
    }),
    columnHelper.accessor('url', {
      cell: (info) => info.getValue() || '-',
      header: 'URL',
    }),
    columnHelper.accessor('status', {
      cell: (info) => info.getValue(),
      header: 'Status',
    }),
    columnHelper.accessor('created_at', {
      cell: (info) => new Date(info.getValue()).toLocaleString(),
      header: 'Created At',
    }),
  ];

  const table = useReactTable({
    data: servers,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const _handleCreateServer = async (data: any) => {
    if (!currentProfile?.uuid) {
      return;
    }
    setIsSubmitting(true);
    try {
      await createMcpServer({
        ...data,
        profileUuid: currentProfile.uuid
      });
      await mutate();
      setOpen(false);
      toast({
        title: t('common.success'),
        description: t('mcpServers.form.success'),
      });
    } catch (_error) {
      toast({
        title: t('common.error'),
        description: t('mcpServers.form.error.createFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateMultipleServers = async (configs: any[]) => {
    if (!currentProfile?.uuid) {
      return;
    }
    setIsSubmitting(true);
    let successCount = 0;
    let failedCount = 0;
    
    try {
      for (const config of configs) {
        try {
          await createMcpServer({
            ...config,
            profileUuid: currentProfile.uuid,
            source: config.source,
            external_id: config.external_id
          });
          successCount++;
        } catch (error) {
          console.error(`Failed to create server ${config.name}:`, error);
          failedCount++;
        }
      }
      
      await mutate();
      
      if (successCount > 0 && failedCount === 0) {
        toast({
          title: t('common.success'),
          description: t('mcpServers.form.multipleSuccess', { count: successCount }),
        });
      } else if (successCount > 0 && failedCount > 0) {
        toast({
          title: t('common.warning'),
          description: t('mcpServers.form.partialSuccess', { success: successCount, failed: failedCount }),
          variant: 'default',
        });
      } else {
        throw new Error('All servers failed to create');
      }
    } catch (_error) {
      toast({
        title: t('common.error'),
        description: t('mcpServers.form.error.createFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImport = async (importJson: string) => {
    if (!currentProfile?.uuid) {
      return;
    }
    setIsSubmitting(true);
    try {
      // Parse the JSON
      let parsedJson;
      try {
        parsedJson = JSON.parse(importJson);
      } catch (_e) {
        throw new Error(t('mcpServers.import.error.invalidJson'));
      }

      // Validate the JSON structure
      if (!parsedJson.mcpServers || typeof parsedJson.mcpServers !== 'object') {
        throw new Error(t('mcpServers.import.error.missingMcpServers'));
      }

      // Process each server based on its type
      const processedJson = {
        mcpServers: Object.entries(parsedJson.mcpServers).reduce((acc, [name, serverConfig]) => {
          const config = serverConfig as any;
          const serverType = config.type?.toLowerCase() === 'sse'
            ? McpServerType.SSE
            : config.type?.toLowerCase() === 'streamable_http'
            ? McpServerType.STREAMABLE_HTTP
            : McpServerType.STDIO;

          // Create server config based on type
          if (serverType === McpServerType.SSE) {
            acc[name] = {
              name,
              description: config.description || '',
              url: config.url,
              type: serverType,
              status: McpServerStatus.ACTIVE,
            };
          } else if (serverType === McpServerType.STREAMABLE_HTTP) {
            // Extract API key from URL if present
            let url = config.url;
            let extractedHeaders = {};
            
            try {
              const urlObj = new URL(url);
              const apiKey = urlObj.searchParams.get('api_key') || urlObj.searchParams.get('apiKey');
              
              if (apiKey) {
                // Smithery requires the API key to remain in the URL
                if (url.includes('server.smithery.ai')) {
                  // Keep the API key in the URL for Smithery
                  console.log('Smithery server detected during import, keeping API key in URL');
                } else {
                  // For other services, extract and remove API key from URL
                  extractedHeaders = { 'Authorization': `Bearer ${apiKey}` };
                  urlObj.searchParams.delete('api_key');
                  urlObj.searchParams.delete('apiKey');
                  url = urlObj.toString();
                }
              }
            } catch (_e) {
              // Invalid URL, use as is
            }
            
            // Merge extracted headers with existing ones
            const streamableOptions = config.streamableHTTPOptions || {};
            const headers = {
              ...extractedHeaders,
              ...(streamableOptions.headers || {})
            };
            
            acc[name] = {
              name,
              description: config.description || '',
              url,
              type: serverType,
              status: McpServerStatus.ACTIVE,
              transport: config.transport || 'streamable_http',
              streamableHTTPOptions: {
                ...streamableOptions,
                headers: Object.keys(headers).length > 0 ? headers : undefined,
              },
            };
          } else {
            // STDIO type
            acc[name] = {
              name,
              description: config.description || '',
              command: config.command,
              args: config.args || [],
              env: config.env || {},
              type: serverType,
              status: McpServerStatus.ACTIVE,
            };
          }
          return acc;
        }, {} as Record<string, any>)
      };

      // Import the servers
      const result = await bulkImportMcpServers(processedJson, currentProfile.uuid);
      await mutate();

      // Show success toast
      toast({
        title: t('common.success'),
        description: t('mcpServers.import.success', { count: result.count }),
        variant: 'default',
      });
    } catch (_error) {
      throw _error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportServerConfig = () => {
    if (!servers.length) {
      toast({
        title: t('common.error'),
        description: t('mcpServers.export.error.noServers'),
        variant: 'destructive',
      });
      return;
    }

    // Transform servers array to the required JSON format
    const mcpServers = servers.reduce((acc: Record<string, any>, server: McpServer) => {
      const serverConfig: any = {
        description: server.description || '',
        type: server.type.toLowerCase(),
      };

      if (server.type === McpServerType.STDIO) {
        serverConfig.command = server.command;
        serverConfig.args = server.args || [];
        serverConfig.env = server.env || {};
      } else if (server.type === McpServerType.SSE) {
        serverConfig.url = server.url;
      }

      acc[server.name] = serverConfig;
      return acc;
    }, {} as Record<string, any>);

    // Create the final JSON structure
    const exportData = {
      mcpServers,
    };

    // Convert to JSON string with formatting
    const jsonString = JSON.stringify(exportData, null, 2);
    setExportJson(jsonString);
    setExportOpen(true);
  };

  const handleDeleteServer = async () => {
    if (!currentProfile?.uuid || !serverToDelete?.uuid) return;
    
    setIsDeleting(true);
    try {
      await deleteMcpServerByUuid(
        currentProfile.uuid,
        serverToDelete.uuid
      );
      await mutate();
      toast({
        title: t('common.success'),
        description: t('mcpServers.actions.deleteSuccess'),
      });
    } catch (_error) {
      toast({
        title: t('common.error'),
        description: t('mcpServers.actions.deleteError'),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setServerToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <ServerHero onAddServer={() => setOpen(true)} />
      <ServerStats servers={servers} />

      {/* Main content */}
      <div className="space-y-4">
        {/* Mobile-optimized header */}
        <div className="flex flex-col space-y-4 sm:flex-row sm:justify-between sm:items-center sm:space-y-0">
          {/* Search and view toggle */}
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <Input
              placeholder={t('mcpServers.actions.search')}
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(String(e.target.value))}
              className="flex-1 sm:max-w-sm"
            />
            
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'grid' | 'table')} className="ml-2">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="grid" className="data-[state=active]:bg-background">
                  <Database className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="table" className="data-[state=active]:bg-background">
                  <Settings className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Button 
              variant="outline" 
              onClick={() => router.push('/search?source=REGISTRY')} 
              className="flex-1 sm:flex-none"
            >
              <Package className="mr-2 h-4 w-4" />
              {t('mcpServers.actions.browseRegistry', 'Browse Registry')}
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)} className="flex-1 sm:flex-none">
              <Upload className="mr-2 h-4 w-4" />
              {t('mcpServers.actions.import')}
            </Button>
            
            <Button 
              variant="outline" 
              onClick={() => setShareCollectionOpen(true)}
              disabled={servers.length === 0}
              className="flex-1 sm:flex-none"
            >
              <Share className="mr-2 h-4 w-4" />
              {t('mcpServers.actions.shareCollection')}
            </Button>
            
            <Button variant="outline" onClick={exportServerConfig} className="flex-1 sm:flex-none">
              <Download className="mr-2 h-4 w-4" />
              {t('mcpServers.actions.export')}
            </Button>
          </div>
        </div>
      </div>

      {/* Server list */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {table.getRowModel().rows.map((row) => (
            <ServerCard
              key={row.original.uuid}
              server={row.original}
              isSelected={selectedServers.some(s => s.uuid === row.original.uuid)}
              onSelect={(checked) => {
                setSelectedServers(prev => 
                  checked 
                    ? [...prev, row.original]
                    : prev.filter(s => s.uuid !== row.original.uuid)
                );
              }}
              onStatusChange={async (checked) => {
                if (!currentProfile?.uuid || !row.original.uuid) return;
                await toggleMcpServerStatus(
                  currentProfile.uuid,
                  row.original.uuid,
                  checked ? McpServerStatus.ACTIVE : McpServerStatus.INACTIVE
                );
                mutate();
              }}
              onDelete={() => {
                setServerToDelete(row.original);
              }}
            />
          ))}
          
          {/* Empty state */}
          {table.getRowModel().rows.length === 0 && (
            <div className="col-span-1 sm:col-span-2 lg:col-span-3 flex flex-col items-center justify-center p-6 sm:p-12 border rounded-lg border-dashed dark:border-slate-800">
              <Database className="h-8 sm:h-12 w-8 sm:w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-base sm:text-lg font-medium text-center">{t('mcpServers.empty.title')}</h3>
              <p className="text-sm text-muted-foreground mb-4 text-center">
                {globalFilter 
                  ? t('mcpServers.empty.noResults', { search: globalFilter })
                  : t('mcpServers.empty.noServers')
                }
              </p>
              <Button onClick={() => setOpen(true)}>
                {t('mcpServers.empty.addFirst')}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <div className="min-w-full px-4 sm:px-0">
            <table className="min-w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-800 rounded-md">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="py-2 px-3 sm:px-4 border-b dark:border-slate-800 text-left font-semibold bg-gray-100 dark:bg-slate-800 text-sm whitespace-nowrap"
                        onClick={header.column.getToggleSortingHandler()}>
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {{
                          asc: ' 🔼',
                          desc: ' 🔽',
                        }[header.column.getIsSorted() as string] ?? null}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="py-2 px-3 sm:px-4 border-b dark:border-slate-800 text-sm">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Smart Add Server Dialog */}
      <SmartServerDialog
        open={open}
        onOpenChange={setOpen}
        onSubmit={handleCreateMultipleServers}
        isSubmitting={isSubmitting}
      />

      {/* Import/Export Dialogs */}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={handleImport}
        isSubmitting={isSubmitting}
      />
      
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        exportJson={exportJson}
      />

      {/* Add Share Collection Dialog */}
      <ShareCollectionDialog
        open={shareCollectionOpen}
        onOpenChange={setShareCollectionOpen}
        servers={selectedServers.length > 0 ? selectedServers : servers}
        profileUuid={currentProfile?.uuid || ''}
        onSuccess={() => {
          setShareCollectionOpen(false);
          toast({
            title: t('common.success'),
            description: t('mcpServers.shareCollection.success'),
          });
        }}
      />

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={!!serverToDelete}
        onOpenChange={(open) => !open && setServerToDelete(null)}
        title={t('mcpServers.actions.deleteTitle')}
        description={t('mcpServers.actions.deleteConfirm')}
        confirmText={t('mcpServers.actions.delete')}
        onConfirm={handleDeleteServer}
        isLoading={isDeleting}
        variant="destructive"
      />
    </div>
  );
}
