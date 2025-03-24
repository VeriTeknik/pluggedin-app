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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { McpServerStatus, McpServerType } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles';
import { McpServer } from '@/types/mcp-server';

export default function McpServerDetailPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { currentProfile } = useProfiles();
  const { uuid } = use(params);
  const router = useRouter();
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
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
      });
      setHasChanges(false);
    }
  }, [mcpServer, form]);

  // Check for changes in form values
  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
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
          value.type !== mcpServer.type;
        
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
  }) => {
    if (!mcpServer || !currentProfile?.uuid) return;

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
    };

    await updateMcpServer(currentProfile.uuid, mcpServer.uuid, processedData);
    await mutate();
    setIsEditingName(false);
    setIsEditingDescription(false);
    setHasChanges(false);
  };

  const handleDelete = async () => {
    if (!mcpServer || !currentProfile?.uuid) return;
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
                if (!currentProfile?.uuid || !mcpServer.uuid) return;
                await toggleMcpServerStatus(
                  currentProfile.uuid,
                  mcpServer.uuid,
                  checked ? McpServerStatus.ACTIVE : McpServerStatus.INACTIVE
                );
                mutate();
              }}
            />
          </div>
          <div onClick={() => setIsEditingName(true)} className="cursor-pointer group">
            {isEditingName ? (
              <Input
                value={form.watch('name')}
                onChange={(e) => form.setValue('name', e.target.value)}
                className="text-2xl font-bold mt-3"
                onBlur={() => setIsEditingName(false)}
                autoFocus
              />
            ) : (
              <CardTitle className="text-2xl font-bold mt-3 group-hover:bg-muted/30 rounded px-1">
                {form.watch('name')}
              </CardTitle>
            )}
          </div>
          <div onClick={() => setIsEditingDescription(true)} className="cursor-pointer group">
            {isEditingDescription ? (
              <Input
                value={form.watch('description')}
                onChange={(e) => form.setValue('description', e.target.value)}
                className="text-md mt-1"
                placeholder="Add a description..."
                onBlur={() => setIsEditingDescription(false)}
                autoFocus
              />
            ) : (
              <CardDescription className="text-md mt-1 group-hover:bg-muted/30 rounded px-1">
                {form.watch('description') || "Click to add a description..."}
              </CardDescription>
            )}
          </div>
        </CardHeader>
      </Card>

      <Form {...form}>
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="w-full justify-start mb-6">
            <TabsTrigger value="details">Server Details</TabsTrigger>
            <TabsTrigger value="config">Configuration</TabsTrigger>
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
        </Tabs>
      </Form>
    </div>
  );
}
