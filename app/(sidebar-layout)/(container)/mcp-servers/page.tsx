'use client';

// React / Next imports
import { useState } from 'react';

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
import { Database, Download, Settings, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

// Internal actions
import { getFirstApiKey } from '@/app/actions/api-keys';
import {
  bulkImportMcpServers,
  createMcpServer,
  deleteMcpServerByUuid,
  getMcpServers,
  toggleMcpServerStatus,
} from '@/app/actions/mcp-servers';

// Internal UI components
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Internal DB schema
import { McpServerStatus, McpServerType } from '@/db/schema';

// Internal hooks
import { useProfiles } from '@/hooks/use-profiles';
import { useProjects } from '@/hooks/use-projects';
import { useToast } from '@/hooks/use-toast';

// Internal types
import { ApiKey } from '@/types/api-key';
import { McpServer } from '@/types/mcp-server';

// Local components
import { ExportDialog, ImportDialog } from './components/server-dialogs';
import { ServerCard } from './components/server-card';
import { ServerHero } from './components/server-hero';
import { ServerStats } from './components/server-stats';
import { SseServerForm, StdioServerForm } from './components/server-forms';


// DiscoverToolsButton Component Definition
function DiscoverToolsButton() {
  const [isDiscovering, setIsDiscovering] = useState(false);
  const { toast } = useToast();
  const { currentProject } = useProjects(); // Get current project

  // Fetch the API key using SWR
  const { data: apiKeyData, isLoading: apiKeyLoading } = useSWR<ApiKey | null>(
    currentProject ? `${currentProject.uuid}/first-api-key` : null,
    () => getFirstApiKey(currentProject?.uuid || '')
  );

  const handleDiscoverTools = async () => {
    const apiKey = apiKeyData?.api_key; // Extract the key string

    if (!apiKey) {
      toast({
        title: 'Error',
        description: apiKeyLoading ? 'Loading API Key...' : 'API Key not found for the current project.',
        variant: 'destructive',
      });
      return;
    }

    setIsDiscovering(true);
    try {
      // The API route uses authenticateApiKey, so the request likely needs
      // credentials (e.g., cookies handled by the browser, or an Authorization header
      // if the API key needs to be sent manually from the client).
      // For simplicity, assuming browser handles session/cookies.
      const response = await fetch('/api/tools/discover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`, // Add Authorization header
        },
      });

      const data = await response.json();

      if (!response.ok) {
        // Use details from API error if available, otherwise the error message
        throw new Error(data.details || data.error || 'Failed to discover tools');
      }

      toast({
        title: 'Success',
        description: data.message || 'Tool discovery initiated.', // Use message from API
        variant: 'default', // Use 'default' or check available variants in use-toast.ts
      });
      // Optionally log details for debugging in the browser console
      if (data.details) {
        console.log('Tool Discovery Details:', data.details);
      }
    } catch (error: any) {
      console.error('Error discovering tools:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to discover tools. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDiscovering(false);
    }
  };

  // Assuming 't' function for translation is not needed directly in this button text
  // If needed, it would have to be passed as a prop.
  return (
    <Button
      onClick={handleDiscoverTools}
      disabled={isDiscovering || apiKeyLoading || !apiKeyData} // Disable while loading or if no key
      variant="secondary"
    >
      {isDiscovering ? 'Discovering...' : (apiKeyLoading ? 'Loading Key...' : 'Discover Tools')}
    </Button>
  );
}


const columnHelper = createColumnHelper<McpServer>();
export default function MCPServersPage() {
  const { currentProfile } = useProfiles();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportJson, setExportJson] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const { data: servers = [], mutate } = useSWR<McpServer[]>(
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
      cell: (info) => info.getValue().join(' ') || '-',
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

  const handleCreateServer = async (data: any) => {
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
    } catch (error) {
      console.error('Error creating MCP server:', error);
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
    } catch (error) {
      throw error;
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
    const mcpServers = servers.reduce((acc, server) => {
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

  return (
    <div className="space-y-6">
      <ServerHero onAddServer={() => setOpen(true)} />
      <ServerStats servers={servers} />

      {/* Main content */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Input
              placeholder={t('mcpServers.actions.search')}
              value={globalFilter ?? ''}
              onChange={(e) => setGlobalFilter(String(e.target.value))}
              className="max-w-sm"
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
          
          <div className="flex space-x-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              {t('mcpServers.actions.import')}
            </Button>
            
            <Button variant="outline" onClick={exportServerConfig}>
              <Download className="mr-2 h-4 w-4" />
              {t('mcpServers.actions.export')}
            </Button>
            {/* Render DiscoverToolsButton without passing apiKey prop */}
            <DiscoverToolsButton />
          </div>
        </div>
      </div>

      {/* Server list */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {table.getRowModel().rows.map((row) => (
            <ServerCard
              key={row.original.uuid}
              server={row.original}
              onStatusChange={async (checked) => {
                if (!currentProfile?.uuid || !row.original.uuid) return;
                await toggleMcpServerStatus(
                  currentProfile.uuid,
                  row.original.uuid,
                  checked ? McpServerStatus.ACTIVE : McpServerStatus.INACTIVE
                );
                mutate();
              }}
              onDelete={async () => {
                if (!currentProfile?.uuid || !row.original.uuid) return;
                if (confirm(t('mcpServers.actions.deleteConfirm'))) {
                  await deleteMcpServerByUuid(
                    currentProfile.uuid,
                    row.original.uuid
                  );
                  mutate();
                }
              }}
            />
          ))}
          
          {/* Empty state */}
          {table.getRowModel().rows.length === 0 && (
            <div className="col-span-3 flex flex-col items-center justify-center p-12 border rounded-lg border-dashed dark:border-slate-800">
              <Database className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">{t('mcpServers.empty.title')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
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
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-800 rounded-md">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="py-2 px-4 border-b dark:border-slate-800 text-left font-semibold bg-gray-100 dark:bg-slate-800"
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
                    <td key={cell.id} className="py-2 px-4 border-b dark:border-slate-800">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Server Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <Tabs defaultValue={McpServerType.STDIO} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value={McpServerType.STDIO}>
                {t('mcpServers.form.commandBased')}
              </TabsTrigger>
              <TabsTrigger value={McpServerType.SSE}>
                {t('mcpServers.form.urlBased')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value={McpServerType.STDIO}>
              <StdioServerForm
                onSubmit={handleCreateServer}
                onCancel={() => setOpen(false)}
                isSubmitting={isSubmitting}
              />
            </TabsContent>
            <TabsContent value={McpServerType.SSE}>
              <SseServerForm
                onSubmit={handleCreateServer}
                onCancel={() => setOpen(false)}
                isSubmitting={isSubmitting}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
