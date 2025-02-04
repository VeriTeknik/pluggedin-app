'use client';

import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { McpServerStatus } from '@/db/schema';
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
  const [isEditing, setIsEditing] = useState(false);

  const form = useForm({
    defaultValues: {
      command: '',
      args: '',
      env: '',
    },
  });

  const {
    data: mcpServer,
    error,
    mutate,
  } = useSWR<McpServer | null>(
    uuid && currentProfile?.uuid
      ? ['getMcpServerByUuid', uuid, currentProfile?.uuid]
      : null,
    () => getMcpServerByUuid(currentProfile?.uuid || '', uuid!)
  );

  useEffect(() => {
    if (mcpServer) {
      form.reset({
        command: mcpServer.command,
        args: mcpServer.args.join(' '),
        env: Object.entries(mcpServer.env)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n'),
      });
    }
  }, [mcpServer, form]);

  const onSubmit = async (data: {
    command: string;
    args: string;
    env: string;
  }) => {
    if (!mcpServer || !currentProfile?.uuid) return;

    // Process args and env before submission
    const processedData = {
      ...data,
      args:
        data.args
          .trim()
          .split(/\s+/)
          .map((arg) => arg.trim()) || [],
      env:
        Object.fromEntries(
          data.env
            .split('\n')
            .filter((line) => line.includes('='))
            .map((line) => {
              const [key, ...values] = line.split('=');
              return [key.trim(), values.join('=').trim()];
            })
        ) || {},
    };

    await updateMcpServer(currentProfile.uuid, mcpServer.uuid, processedData);
    await mutate();
    setIsEditing(false);
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
    <div>
      <div className='flex justify-between items-center mb-8'>
        <Button
          variant='outline'
          onClick={() => {
            if (window.history.length > 1) {
              router.back();
            } else {
              router.push('/mcp-servers');
            }
          }}
          className='flex items-center p-4'>
          <ArrowLeft className='mr-2' size={16} />
          Back
        </Button>

        <div className='flex gap-2'>
          <Dialog open={isEditing} onOpenChange={setIsEditing}>
            <DialogTrigger asChild>
              <Button variant='outline'>
                <Pencil className='h-4 w-4 mr-2' />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit MCP Server</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className='space-y-4'>
                  <FormField
                    control={form.control}
                    name='command'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Command</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='args'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Arguments (space-separated)</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='env'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Environment Variables (key=value, one per line)
                        </FormLabel>
                        <FormControl>
                          <textarea
                            className='w-full min-h-[100px] px-3 py-2 rounded-md border'
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <div className='flex justify-end gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                    <Button type='submit'>Save Changes</Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          <Button variant='destructive' onClick={handleDelete}>
            <Trash2 className='mr-2' size={16} />
            Delete Server
          </Button>
        </div>
      </div>

      <h1 className='text-3xl font-bold mb-8'>{mcpServer.name}</h1>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
        <div className='space-y-4'>
          <p className='mb-3'>
            <strong>UUID:</strong> {mcpServer.uuid}
          </p>

          <p className='mb-3 flex items-center gap-2'>
            <strong>Status:</strong>{' '}
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
          </p>

          <p className='mb-3'>
            <strong>Created At:</strong>{' '}
            {new Date(mcpServer.created_at).toLocaleString()}
          </p>

          <p className='mb-3'>
            <strong>Description:</strong>{' '}
            <span className='whitespace-pre-wrap'>{mcpServer.description}</span>
          </p>

          <div className='mb-3'>
            <strong>Command:</strong>
            <pre className='mt-2 p-2 bg-secondary rounded-md'>
              {mcpServer.command}
            </pre>
          </div>

          <div className='mb-3'>
            <strong>Arguments:</strong>
            <pre className='mt-2 p-2 bg-secondary rounded-md'>
              {mcpServer.args.join(' ')}
            </pre>
          </div>

          <div className='mb-3'>
            <strong>Environment Variables:</strong>
            <pre className='mt-2 p-2 bg-secondary rounded-md'>
              {Object.entries(mcpServer.env).length > 0
                ? Object.entries(mcpServer.env).map(
                    ([key, value]) => `${key}=${value}\n`
                  )
                : 'No environment variables set'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
