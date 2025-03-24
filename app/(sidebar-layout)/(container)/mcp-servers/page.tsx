'use client';

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { 
  Activity, 
  CheckCircle, 
  Copy, 
  Database, 
  Download, 
  Globe, 
  Settings, 
  Terminal, 
  Trash2, 
  Upload, 
  XCircle, 
  Zap 
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import useSWR from 'swr';

import {
  bulkImportMcpServers,
  createMcpServer,
  deleteMcpServerByUuid,
  getMcpServers,
  toggleMcpServerStatus,
} from '@/app/actions/mcp-servers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { McpServerStatus, McpServerType } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles';
import { useToast } from '@/hooks/use-toast';
import { McpServer } from '@/types/mcp-server';

const columnHelper = createColumnHelper<McpServer>();

export default function MCPServersPage() {
  const { currentProfile } = useProfiles();
  const { toast } = useToast();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportJson, setExportJson] = useState('');
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
      command: '',
      args: '',
      env: '',
      url: '',
      type: McpServerType.STDIO,
    },
  });

  const { data: servers = [], mutate } = useSWR<McpServer[]>(
    currentProfile?.uuid ? `${currentProfile.uuid}/mcp-servers` : null,
    () => getMcpServers(currentProfile?.uuid || '')
  );

  const columns = [
    columnHelper.accessor('name', {
      cell: (info) => (
        <Link
          href={`/mcp-servers/${info.row.original.uuid}`}
          className='text-primary hover:underline'>
          {info.getValue()}
        </Link>
      ),
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
      cell: (info) => (
        <Badge variant="outline" className={info.getValue() === McpServerType.STDIO 
          ? "bg-purple-500/10 text-purple-700" 
          : "bg-blue-500/10 text-blue-700"
        }>
          {info.getValue()}
        </Badge>
      ),
      header: 'Type',
    }),
    columnHelper.accessor('url', {
      cell: (info) => info.getValue() || '-',
      header: 'URL',
    }),
    columnHelper.accessor('status', {
      cell: (info) => (
        <Switch
          checked={info.getValue() === McpServerStatus.ACTIVE}
          onCheckedChange={async (checked) => {
            if (!currentProfile?.uuid || !info.row.original.uuid) return;
            await toggleMcpServerStatus(
              currentProfile.uuid,
              info.row.original.uuid,
              checked ? McpServerStatus.ACTIVE : McpServerStatus.INACTIVE
            );
            mutate();
          }}
        />
      ),
      header: 'Status',
    }),
    columnHelper.accessor('created_at', {
      cell: (info) => new Date(info.getValue()).toLocaleString(),
      header: 'Created At',
    }),
    columnHelper.display({
      id: 'actions',
      cell: (info) => (
        <Button
          variant='destructive'
          size='sm'
          onClick={async () => {
            if (!currentProfile?.uuid || !info.row.original.uuid) return;
            if (confirm('Are you sure you want to delete this MCP server?')) {
              await deleteMcpServerByUuid(
                currentProfile.uuid,
                info.row.original.uuid
              );
              mutate();
            }
          }}>
          <Trash2 size={16} />
        </Button>
      ),
      header: 'Actions',
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

  const exportServerConfig = () => {
    if (!servers.length) {
      toast({
        title: 'Export Failed',
        description: 'No MCP servers to export.',
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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(exportJson).then(
      () => {
        setCopiedToClipboard(true);
        toast({
          title: 'Copied to Clipboard',
          description: 'MCP server configuration copied to clipboard.',
          variant: 'default',
        });
        setTimeout(() => setCopiedToClipboard(false), 2000);
      },
      (err) => {
        console.error('Could not copy text: ', err);
        toast({
          title: 'Copy Failed',
          description: 'Failed to copy to clipboard.',
          variant: 'destructive',
        });
      }
    );
  };

  const downloadJson = () => {
    // Create and trigger download
    const blob = new Blob([exportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mcp-servers-config.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: 'Download Successful',
      description: `Downloaded ${servers.length} MCP server${servers.length !== 1 ? 's' : ''} configuration.`,
      variant: 'default',
    });
  };

  const getServerIcon = (server: McpServer) => {
    if (server.type === McpServerType.STDIO) {
      return <Terminal className="h-4 w-4 text-purple-500" />;
    } else {
      return <Globe className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-indigo-500/5 to-purple-500/5 p-6 rounded-lg border mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <Badge className="bg-indigo-500/10 text-indigo-700 border-indigo-200 mb-2">MCP Servers</Badge>
            <h1 className="text-3xl font-bold tracking-tight">Plugin Management</h1>
            <p className="text-muted-foreground max-w-md">
              Configure and manage your MCP servers. Connect to external tools and services through command-line or URL-based interfaces.
            </p>
          </div>
          <div className="flex gap-3 mt-4 md:mt-0">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">
                  <Zap className="mr-2 h-4 w-4" />
                  Add Server
                </Button>
              </DialogTrigger>
              <DialogContent className='sm:max-w-[425px]'>
                <DialogHeader>
                  <DialogTitle>Add MCP Server</DialogTitle>
                  <DialogDescription>
                    Create a new MCP server configuration. Choose between STDIO
                    (command-based) or SSE (URL-based) server type.
                  </DialogDescription>
                </DialogHeader>
                <Tabs defaultValue={McpServerType.STDIO} className='w-full'>
                  <TabsList className='grid w-full grid-cols-2'>
                    <TabsTrigger value={McpServerType.STDIO}>
                      Command-based (STDIO)
                    </TabsTrigger>
                    <TabsTrigger value={McpServerType.SSE}>
                      URL-based (SSE)
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value={McpServerType.STDIO}>
                    <Form {...form}>
                      <form
                        onSubmit={form.handleSubmit(async (data) => {
                          if (!currentProfile?.uuid) return;
                          setIsSubmitting(true);
                          try {
                            const processedData = {
                              ...data,
                              type: McpServerType.STDIO,
                              args: data.args
                                .split(',')
                                .map((arg) => arg.trim())
                                .filter(Boolean),
                              env: Object.fromEntries(
                                data.env
                                  .split('\n')
                                  .filter((line) => line.includes('='))
                                  .map((line) => {
                                    const [key, ...values] = line.split('=');
                                    return [key.trim(), values.join('=').trim()];
                                  })
                              ),
                              status: McpServerStatus.ACTIVE,
                              url: undefined,
                            };

                            await createMcpServer(
                              currentProfile.uuid,
                              processedData
                            );
                            await mutate();
                            setOpen(false);
                            form.reset();
                          } catch (error) {
                            console.error('Error creating MCP server:', error);
                          } finally {
                            setIsSubmitting(false);
                          }
                        })}
                        className='space-y-4'>
                        <FormField
                          control={form.control}
                          name='name'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Name</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder='e.g., mcp-server-time'
                                  required
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name='description'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Description</FormLabel>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  placeholder="(Optional) Brief description of the server's purpose"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name='command'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Command</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder='e.g., npx or uvx'
                                  required
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name='args'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Arguments</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder='e.g., mcp-server-time, --local-timezone=America/Los_Angeles'
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name='env'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Environment Variables</FormLabel>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  placeholder='KEY=value                                                                                ANOTHER_KEY=another_value'
                                  className='font-mono text-sm'
                                />
                              </FormControl>
                              <p className='text-sm text-muted-foreground'>
                                Enter environment variables in KEY=value format,
                                one per line
                              </p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className='flex justify-end space-x-2'>
                          <Button
                            type='button'
                            variant='outline'
                            onClick={() => {
                              setOpen(false);
                              form.reset();
                            }}
                            disabled={isSubmitting}>
                            Cancel
                          </Button>
                          <Button type='submit' disabled={isSubmitting}>
                            {isSubmitting ? 'Creating...' : 'Create'}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </TabsContent>
                  <TabsContent value={McpServerType.SSE}>
                    <Form {...form}>
                      <form
                        onSubmit={form.handleSubmit(async (data) => {
                          if (!currentProfile?.uuid) return;
                          setIsSubmitting(true);
                          try {
                            const processedData = {
                              ...data,
                              type: McpServerType.SSE,
                              args: [],
                              env: {},
                              status: McpServerStatus.ACTIVE,
                              command: undefined,
                            };

                            await createMcpServer(
                              currentProfile.uuid,
                              processedData
                            );
                            await mutate();
                            setOpen(false);
                            form.reset();
                          } catch (error) {
                            console.error('Error creating MCP server:', error);
                          } finally {
                            setIsSubmitting(false);
                          }
                        })}
                        className='space-y-4'>
                        <FormField
                          control={form.control}
                          name='name'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Name</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder='e.g., figma-mcp-server'
                                  required
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name='description'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Description</FormLabel>
                              <FormControl>
                                <Textarea
                                  {...field}
                                  placeholder="(Optional) Brief description of the server's purpose"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name='url'
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Server URL</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder='http://localhost:3000/sse'
                                  required
                                  pattern='^(http|https)://[^\s/$.?#].[^\s]*$'
                                />
                              </FormControl>
                              <p className='text-sm text-muted-foreground'>
                                Must be a valid HTTP/HTTPS URL
                              </p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className='flex justify-end space-x-2'>
                          <Button
                            type='button'
                            variant='outline'
                            onClick={() => {
                              setOpen(false);
                              form.reset();
                            }}
                            disabled={isSubmitting}>
                            Cancel
                          </Button>
                          <Button type='submit' disabled={isSubmitting}>
                            {isSubmitting ? 'Creating...' : 'Create'}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </TabsContent>
                </Tabs>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <Card className="bg-white/50">
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">Total Servers</p>
                <p className="text-2xl font-bold">{servers.length}</p>
              </div>
              <Database className="h-8 w-8 text-indigo-500/50" />
            </CardContent>
          </Card>
          
          <Card className="bg-white/50">
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold">
                  {servers.filter(s => s.status === McpServerStatus.ACTIVE).length}
                </p>
              </div>
              <Activity className="h-8 w-8 text-green-500/50" />
            </CardContent>
          </Card>
          
          <Card className="bg-white/50">
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">STDIO</p>
                <p className="text-2xl font-bold">
                  {servers.filter(s => s.type === McpServerType.STDIO).length}
                </p>
              </div>
              <Terminal className="h-8 w-8 text-slate-500/50" />
            </CardContent>
          </Card>
          
          <Card className="bg-white/50">
            <CardContent className="p-4 flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">SSE</p>
                <p className="text-2xl font-bold">
                  {servers.filter(s => s.type === McpServerType.SSE).length}
                </p>
              </div>
              <Globe className="h-8 w-8 text-blue-500/50" />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main content */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Input
              placeholder="Search servers..."
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
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Import MCP Servers</DialogTitle>
                  <DialogDescription>
                    Import multiple MCP server configurations from JSON. This will add new servers without replacing existing ones.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="bg-muted/30 p-4 rounded-md">
                    <h4 className="text-sm font-medium mb-2">JSON Format</h4>
                    <pre className="p-2 bg-slate-900 text-slate-50 rounded-md text-xs overflow-x-auto whitespace-pre-wrap break-all">
                      {`{
  "mcpServers": {
    "CommandBasedServerName": {
      "command": "command",
      "args": ["arg1", "arg2"],
      "env": {
        "KEY": "value"
      },
      "description": "Optional description",
      "type": "stdio" // optional, defaults to "stdio"
    },
    "UrlBasedServerName": {
      "url": "https://example.com/sse",
      "description": "Optional description",
      "type": "sse" // optional, defaults to "stdio"
    }
  }
}`}
                    </pre>
                  </div>
                  <div>
                    <ScrollArea className="h-[200px] rounded-md border border-input">
                      <Textarea
                        value={importJson}
                        onChange={(e) => {
                          setImportJson(e.target.value);
                          setImportError('');
                        }}
                        placeholder='Paste your JSON here'
                        className="font-mono text-sm resize-none border-0 h-full p-4"
                      />
                    </ScrollArea>
                    {importError && (
                      <div className="mt-2 text-sm text-destructive flex items-start p-2 rounded-md bg-destructive/10">
                        <XCircle className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5" />
                        <p>{importError}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setImportOpen(false);
                        setImportJson('');
                        setImportError('');
                      }}
                      disabled={isSubmitting}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={isSubmitting}
                      onClick={async () => {
                        setIsSubmitting(true);
                        try {
                          // Parse the JSON
                          let parsedJson;
                          try {
                            parsedJson = JSON.parse(importJson);
                          } catch (_e) {
                            setImportError('Invalid JSON format');
                            setIsSubmitting(false);
                            return;
                          }

                          // Validate the JSON structure
                          if (
                            !parsedJson.mcpServers ||
                            typeof parsedJson.mcpServers !== 'object'
                          ) {
                            setImportError(
                              'JSON must contain a "mcpServers" object'
                            );
                            setIsSubmitting(false);
                            return;
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
                          const result = await bulkImportMcpServers(
                            processedJson,
                            currentProfile?.uuid
                          );

                          // Refresh the server list
                          await mutate();

                          // Close the dialog and reset
                          setImportOpen(false);
                          setImportJson('');
                          setImportError('');

                          // Show success toast
                          toast({
                            title: 'Import Successful',
                            description: `Successfully imported ${result.count} MCP server${result.count !== 1 ? 's' : ''}.`,
                            variant: 'default',
                          });
                        } catch (error) {
                          console.error('Error importing MCP servers:', error);
                          setImportError(
                            'Failed to import servers. Check the console for details.'
                          );

                          // Show error toast
                          toast({
                            title: 'Import Failed',
                            description:
                              'Failed to import MCP servers. Please check the console for details.',
                            variant: 'destructive',
                          });
                        } finally {
                          setIsSubmitting(false);
                        }
                      }}>
                      {isSubmitting ? 'Importing...' : 'Import Servers'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            
            <Button variant="outline" onClick={exportServerConfig}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Dialog open={exportOpen} onOpenChange={setExportOpen}>
              <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                  <DialogTitle>Export MCP Servers Configuration</DialogTitle>
                  <DialogDescription>
                    Your MCP server configurations in JSON format, ready to import on another instance.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="relative rounded-md border overflow-hidden">
                    <ScrollArea className="h-[300px]">
                      <pre className="p-4 bg-slate-900 text-slate-50 text-xs whitespace-pre-wrap break-all">
                        {exportJson}
                      </pre>
                    </ScrollArea>
                    <div className="absolute top-2 right-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="bg-white"
                              onClick={copyToClipboard}>
                              <Copy className="h-3.5 w-3.5 mr-1" />
                              {copiedToClipboard ? 'Copied!' : 'Copy'}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Copy JSON to clipboard
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setExportOpen(false);
                      }}>
                      Close
                    </Button>
                    <Button
                      type="button"
                      onClick={downloadJson}>
                      <Download className="mr-2 h-4 w-4" />
                      Download JSON
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Main content sections */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {table.getRowModel().rows.map((row) => {
            const server = row.original;
            return (
              <Card key={server.uuid} className="group hover:shadow-md transition-all">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary/10">
                      {getServerIcon(server)}
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <Switch
                              checked={server.status === McpServerStatus.ACTIVE}
                              onCheckedChange={async (checked) => {
                                if (!currentProfile?.uuid) return;
                                await toggleMcpServerStatus(
                                  currentProfile.uuid,
                                  server.uuid,
                                  checked ? McpServerStatus.ACTIVE : McpServerStatus.INACTIVE
                                );
                                mutate();
                              }}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {server.status === McpServerStatus.ACTIVE ? 'Active' : 'Inactive'}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <CardTitle className="mt-3 text-xl">
                    <Link href={`/mcp-servers/${server.uuid}`} className="hover:text-primary transition-colors">
                      {server.name}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {server.description || 'No description provided'}
                  </CardDescription>
                </CardHeader>
                
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Badge variant="outline">{server.type}</Badge>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground justify-end">
                      {server.status === McpServerStatus.ACTIVE ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-200">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-200">
                          <XCircle className="mr-1 h-3 w-3" />
                          Inactive
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
                      Created: {new Date(server.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </CardContent>
                
                <CardFooter className="flex justify-between pt-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/mcp-servers/${server.uuid}`}>
                      Edit
                    </Link>
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={async () => {
                      if (!currentProfile?.uuid) return;
                      if (confirm('Are you sure you want to delete this MCP server?')) {
                        await deleteMcpServerByUuid(
                          currentProfile.uuid,
                          server.uuid
                        );
                        mutate();
                      }
                    }}
                  >
                    <Trash2 size={14} className="mr-1" />
                    Delete
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
          
          {/* Empty state */}
          {table.getRowModel().rows.length === 0 && (
            <div className="col-span-3 flex flex-col items-center justify-center p-12 border rounded-lg border-dashed">
              <Database className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">No Servers Found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {globalFilter 
                  ? `No servers match "${globalFilter}"`
                  : "You haven't added any MCP servers yet"
                }
              </p>
              <Button onClick={() => setOpen(true)}>
                <Zap className="mr-2 h-4 w-4" />
                Add Your First Server
              </Button>
            </div>
          )}
        </div>
      ) : (
        // Table view (keep the existing table implementation)
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-300 rounded-md">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className='py-2 px-4 border-b text-left font-semibold bg-gray-100'
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
                <tr key={row.id} className='hover:bg-gray-50'>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className='py-2 px-4 border-b'>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
