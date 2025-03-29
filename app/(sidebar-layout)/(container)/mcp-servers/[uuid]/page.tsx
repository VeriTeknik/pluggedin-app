'use client';

import { Activity, ArrowLeft, Clock, Database, Globe, Save, Server, Terminal, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import useSWR from 'swr';

import {
  deleteMcpServerByUuid,
  getMcpServerByUuid,
  toggleMcpServerStatus,
  updateMcpServer,
} from '@/app/actions/mcp-servers';
import InlineEditText from '@/components/InlineEditText';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea'; // Import Textarea
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton for loading state
import { McpServerStatus, McpServerType } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles';
import { McpServer } from '@/types/mcp-server';
import { ResourceTemplate } from '@/types/resource-template'; // Assuming this type exists or will be created

export default function McpServerDetailPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { currentProfile } = useProfiles();
  const { uuid } = use(params);
  const router = useRouter();
  // const [isEditingName, setIsEditingName] = useState(false);
  // const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
      command: '',
      args: '',
      env: '',
      url: '',
      type: McpServerType.STDIO,
      notes: '', // Add notes field
    },
  });

  const {
    data: mcpServer,
    error,
    mutate,
  } = useSWR<McpServer | undefined>(
    uuid && currentProfile?.uuid
      ? ['getMcpServerByUuid', uuid, currentProfile?.uuid]
      : null,
    () => getMcpServerByUuid(currentProfile?.uuid || '', uuid!)
  );

  // SWR hook for fetching resource templates
  const {
    data: resourceTemplates,
    error: templatesError,
    isLoading: isLoadingTemplates,
  } = useSWR<ResourceTemplate[]>(
    uuid ? `/api/mcp-servers/${uuid}/resource-templates` : null,
    (url: string) => fetch(url).then((res) => res.json()) // Add type to url parameter
  );

  useEffect(() => {
    if (mcpServer) {
      form.reset({
        name: mcpServer.name,
        description: mcpServer.description || '',
        command: mcpServer.command || '',
        args: mcpServer.args.join(' '),
        env: Object.entries(mcpServer.env)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n'),
        url: mcpServer.url || '',
        type: mcpServer.type,
        notes: mcpServer.notes || '', // Reset notes field
      });
      setHasChanges(false);
    }
  }, [mcpServer, form]);

  // Check for changes in form values
  useEffect(() => {
    const subscription = form.watch((value) => {
      if (mcpServer) {
        const isDifferent = 
          value.name !== mcpServer.name ||
          value.description !== (mcpServer.description || '') ||
          (mcpServer.type === McpServerType.STDIO && (
            value.command !== (mcpServer.command || '') ||
            value.args !== mcpServer.args.join(' ') ||
            value.env !== Object.entries(mcpServer.env)
              .map(([key, value]) => `${key}=${value}`)
              .join('\n')
          )) ||
          (mcpServer.type === McpServerType.SSE && value.url !== (mcpServer.url || '')) ||
          value.type !== mcpServer.type ||
          value.notes !== (mcpServer.notes || ''); // Check notes field

        setHasChanges(isDifferent);
      }
    });
    
    return () => subscription.unsubscribe();
  }, [form, mcpServer]);

  const onSubmit = async (data: {
    name: string;
    description: string;
    command: string;
    args: string;
    env: string;
    url: string;
    type: McpServerType;
    notes: string; // Add notes to type
  }) => {
    if (!mcpServer || !currentProfile?.uuid) {
      return;
    }

    // Process args and env before submission
    const processedData = {
      ...data,
      args: data.type === McpServerType.STDIO
        ? data.args
          .trim()
          .split(/\s+/)
          .map((arg) => arg.trim())
        : [],
      env: data.type === McpServerType.STDIO
        ? Object.fromEntries(
          data.env
            .split('\n')
            .filter((line) => line.includes('='))
            .map((line) => {
              const [key, ...values] = line.split('=');
              return [key.trim(), values.join('=').trim()];
            })
        ) || {}
        : {},
      command: data.type === McpServerType.STDIO ? data.command : undefined,
      url: data.type === McpServerType.SSE ? data.url : undefined,
      notes: data.notes, // Include notes in processed data
    };

    // Ensure processedData aligns with the expected type for updateMcpServer
    // The action now accepts null for description, command, url, notes
    await updateMcpServer(currentProfile.uuid, mcpServer.uuid, processedData);
    await mutate(); // Re-fetch server data after update
    // setIsEditingName(false);
    // setIsEditingDescription(false);
    // setHasChanges(false);
  };

  const handleDelete = async () => {
    if (!mcpServer || !currentProfile?.uuid) {
      return;
    }
    if (confirm('Are you sure you want to delete this MCP server?')) {
      await deleteMcpServerByUuid(currentProfile.uuid, mcpServer.uuid);
      router.push('/mcp-servers');
    }
  };

  if (error) return <div>Failed to load MCP server</div>;
  if (!mcpServer) return <div>Loading...</div>;

  return (
    <div className="container mx-auto py-6">
      <div className='flex justify-between items-center mb-6'>
        <Button
          variant='ghost'
          onClick={() => {
            if (window.history.length > 1) {
              router.back();
            } else {
              router.push('/mcp-servers');
            }
          }}
          className='flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors'>
          <ArrowLeft size={16} />
          Back to servers
        </Button>

        <div className='flex gap-2'>
          {hasChanges && (
            <Button 
              variant='default' 
              className="shadow-sm" 
              onClick={form.handleSubmit(onSubmit)}
            >
              <Save className='h-4 w-4 mr-2' />
              Save Changes
            </Button>
          )}
          <Button variant='destructive' className="shadow-sm" onClick={handleDelete}>
            <Trash2 className='mr-2' size={16} />
            Delete
          </Button>
        </div>
      </div>

      <Card className="shadow-md border-muted mb-6">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-2">
              <Badge variant={mcpServer.status === McpServerStatus.ACTIVE ? "default" : "secondary"}>
                {mcpServer.status === McpServerStatus.ACTIVE ? "Active" : "Inactive"}
              </Badge>
              <Badge variant="outline">{mcpServer.type}</Badge>
            </div>
            <Switch
              checked={mcpServer.status === McpServerStatus.ACTIVE}
              onCheckedChange={async (checked) => {
                if (!currentProfile?.uuid || !mcpServer.uuid) {
                  return;
                }
                await toggleMcpServerStatus(
                  currentProfile.uuid,
                  mcpServer.uuid,
                  checked ? McpServerStatus.ACTIVE : McpServerStatus.INACTIVE
                );
                mutate();
              }}
            />
          </div>
          <div onClick={() => {}}>
  <InlineEditText
    value={form.watch('name')}
    onSave={(newName) => form.setValue('name', newName)}
    placeholder="Enter server name"
  />
</div>
<div onClick={() => {}}>
  <InlineEditText
    value={form.watch('description')}
    onSave={(newDesc) => form.setValue('description', newDesc)}
    placeholder="Click to add a description..."
  />
</div>
        </CardHeader>
      </Card>

      <Form {...form}>
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="w-full justify-start mb-6">
            <TabsTrigger value="details">Server Details</TabsTrigger>
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="templates">Resource Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-md font-medium flex items-center">
                    <Server className="mr-2 h-4 w-4" />
                    Server Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  <div className="flex items-start justify-between border-b pb-2">
                    <span className="text-sm font-medium text-muted-foreground">UUID</span>
                    <span className="text-sm font-mono">{mcpServer.uuid}</span>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-sm font-medium text-muted-foreground flex items-center">
                      <Activity className="mr-1 h-4 w-4" />
                      Status
                    </span>
                    <Badge variant={mcpServer.status === McpServerStatus.ACTIVE ? "default" : "secondary"}>
                      {mcpServer.status === McpServerStatus.ACTIVE ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-sm font-medium text-muted-foreground flex items-center">
                      <Clock className="mr-1 h-4 w-4" />
                      Created
                    </span>
                    <span className="text-sm">{new Date(mcpServer.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Type</span>
                    <div className="relative inline-block cursor-pointer group">
                      <select
                        value={form.watch('type')}
                        onChange={(e) => form.setValue('type', e.target.value as McpServerType)}
                        className="absolute opacity-0 w-full h-full cursor-pointer"
                      >
                        <option value={McpServerType.STDIO}>STDIO</option>
                        <option value={McpServerType.SSE}>SSE</option>
                      </select>
                      <Badge variant="outline" className="group-hover:bg-muted">
                        {form.watch('type') === McpServerType.STDIO ? "STDIO" : "SSE"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Consider adding a card for Notes preview here if desired */}

            </div>
          </TabsContent>

          <TabsContent value="config">
            <div className="grid grid-cols-1 gap-6">
              {form.watch('type') === McpServerType.STDIO ? (
                <>
                  <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-md font-medium flex items-center">
                        <Terminal className="mr-2 h-4 w-4" />
                        Command Configuration
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="mb-4">
                        <h3 className="text-sm font-medium text-muted-foreground mb-2">Command</h3>
                        <div className="relative group cursor-text">
                          <Input
                            value={form.watch('command')}
                            onChange={(e) => form.setValue('command', e.target.value)}
                            className="bg-muted p-3 rounded-md font-mono text-sm"
                            placeholder="e.g., npx or uvx"
                          />
                        </div>
                      </div>
                      
                      <div className="mb-4">
                        <h3 className="text-sm font-medium text-muted-foreground mb-2">Arguments</h3>
                        <div className="relative group cursor-text">
                          <Input
                            value={form.watch('args')}
                            onChange={(e) => form.setValue('args', e.target.value)}
                            className="bg-muted p-3 rounded-md font-mono text-sm"
                            placeholder="e.g., mcp-server-time"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-md font-medium flex items-center">
                        <Database className="mr-2 h-4 w-4" />
                        Environment Variables
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="relative group cursor-text">
                        <textarea
                          value={form.watch('env')}
                          onChange={(e) => form.setValue('env', e.target.value)}
                          className="w-full bg-muted p-3 rounded-md font-mono text-sm min-h-[150px] border-none resize-y"
                          placeholder="KEY=value
ANOTHER_KEY=another_value"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-md font-medium flex items-center">
                      <Globe className="mr-2 h-4 w-4" />
                      Server URL
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="relative group cursor-text">
                      <Input
                        value={form.watch('url')}
                        onChange={(e) => form.setValue('url', e.target.value)}
                        className="bg-muted p-3 rounded-md font-mono text-sm"
                        placeholder="http://localhost:3000/sse"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="notes">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-md font-medium">Notes</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Textarea
                  value={form.watch('notes')}
                  onChange={(e) => form.setValue('notes', e.target.value)}
                  placeholder="Add any notes, usage instructions, or known quirks for this server..."
                  className="min-h-[200px] font-mono text-sm"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-md font-medium">Resource Templates</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {isLoadingTemplates && (
                  <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                )}
                {templatesError && (
                  <p className="text-destructive text-sm">
                    Failed to load resource templates.
                  </p>
                )}
                {!isLoadingTemplates && !templatesError && (!resourceTemplates || resourceTemplates.length === 0) && (
                  <p className="text-muted-foreground text-sm">
                    No resource templates found for this server.
                  </p>
                )}
                {!isLoadingTemplates && !templatesError && resourceTemplates && resourceTemplates.length > 0 && (
                  <div className="space-y-4">
                    {resourceTemplates.map((template) => (
                      <div key={template.uuid} className="border p-4 rounded-md bg-muted/50">
                        <p className="font-mono text-sm break-all mb-1">{template.uri_template}</p>
                        {template.template_variables && template.template_variables.length > 0 && (
                           <div className="mb-2">
                             <span className="text-xs font-medium text-muted-foreground mr-2">Variables:</span>
                             {template.template_variables.map((variable: string) => ( // Add type to variable
                               <Badge key={variable} variant="secondary" className="mr-1 font-mono text-xs">{variable}</Badge>
                             ))}
                           </div>
                         )}
                        {template.name && <p className="text-sm font-semibold mb-1">{template.name}</p>}
                        {template.description && <p className="text-xs text-muted-foreground">{template.description}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </Form>
    </div>
  );
}
