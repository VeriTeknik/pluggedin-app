'use client';

import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import useSWR from 'swr';

import {
  deleteCustomMcpServerByUuid,
  getCustomMcpServerByUuid,
  toggleCustomMcpServerStatus,
  updateCustomMcpServer,
} from '@/app/actions/custom-mcp-servers';
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
import { CustomMcpServer } from '@/types/custom-mcp-server';

export default function CustomMcpServerDetailPage({
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
      additionalArgs: '',
      env: '',
      code_uuid: '',
    },
  });

  const {
    data: customMcpServer,
    error,
    mutate,
  } = useSWR<CustomMcpServer | null>(
    uuid && currentProfile?.uuid
      ? ['getCustomMcpServerByUuid', uuid, currentProfile?.uuid]
      : null,
    () => getCustomMcpServerByUuid(currentProfile?.uuid || '', uuid!)
  );

  useEffect(() => {
    if (customMcpServer) {
      form.reset({
        additionalArgs: customMcpServer.additionalArgs.join(', '),
        env: Object.entries(customMcpServer.env)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n'),
        code_uuid: customMcpServer.code_uuid || '',
      });
    }
  }, [customMcpServer, form]);

  const onSubmit = async (data: {
    additionalArgs: string;
    env: string;
    code_uuid: string;
  }) => {
    if (!customMcpServer || !currentProfile?.uuid) return;

    // Process args and env before submission
    const processedData = {
      ...data,
      additionalArgs:
        data.additionalArgs.split(',').map((arg) => arg.trim()) || [],
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
      code_uuid: data.code_uuid,
    };

    await updateCustomMcpServer(
      currentProfile.uuid,
      customMcpServer.uuid,
      processedData
    );
    await mutate();
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!customMcpServer || !currentProfile?.uuid) return;
    if (confirm('Are you sure you want to delete this Custom MCP server?')) {
      await deleteCustomMcpServerByUuid(
        currentProfile.uuid,
        customMcpServer.uuid
      );
      router.push('/custom-mcp-servers');
    }
  };

  if (error) return <div>Failed to load Custom MCP server</div>;
  if (!customMcpServer) return <div>Loading...</div>;

  return (
    <div>
      <div className='flex justify-between items-center mb-8'>
        <Button
          variant='outline'
          onClick={() => {
            if (window.history.length > 1) {
              router.back();
            } else {
              router.push('/custom-mcp-servers');
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
                <DialogTitle>Edit Custom MCP Server</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className='space-y-4'>
                  <FormField
                    control={form.control}
                    name='additionalArgs'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Additional Arguments (comma-separated)
                        </FormLabel>
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
                  <FormField
                    control={form.control}
                    name='code_uuid'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Code</FormLabel>
                        <FormControl>
                          <textarea
                            className='w-full min-h-[200px] px-3 py-2 rounded-md border font-mono'
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

      <h1 className='text-3xl font-bold mb-8'>{customMcpServer.name}</h1>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-8'>
        <div className='space-y-4'>
          <p className='mb-3'>
            <strong>UUID:</strong> {customMcpServer.uuid}
          </p>

          <p className='mb-3 flex items-center gap-2'>
            <strong>Status:</strong>{' '}
            <Switch
              checked={customMcpServer.status === McpServerStatus.ACTIVE}
              onCheckedChange={async (checked) => {
                if (!currentProfile?.uuid || !customMcpServer.uuid) return;
                await toggleCustomMcpServerStatus(
                  currentProfile.uuid,
                  customMcpServer.uuid,
                  checked ? McpServerStatus.ACTIVE : McpServerStatus.INACTIVE
                );
                mutate();
              }}
            />
          </p>

          <p className='mb-3'>
            <strong>Created At:</strong>{' '}
            {new Date(customMcpServer.created_at).toLocaleString()}
          </p>

          <p className='mb-3'>
            <strong>Description:</strong>{' '}
            <span className='whitespace-pre-wrap'>
              {customMcpServer.description}
            </span>
          </p>

          <div className='mb-3'>
            <strong>Additional Arguments:</strong>
            <pre className='mt-2 p-2 bg-secondary rounded-md'>
              {customMcpServer.additionalArgs.length > 0
                ? customMcpServer.additionalArgs.join(' ')
                : 'No additional arguments set'}
            </pre>
          </div>

          <div className='mb-3'>
            <strong>Environment Variables:</strong>
            <pre className='mt-2 p-2 bg-secondary rounded-md'>
              {Object.entries(customMcpServer.env).length > 0
                ? Object.entries(customMcpServer.env).map(
                    ([key, value]) => `${key}=${value}\n`
                  )
                : 'No environment variables set'}
            </pre>
          </div>

          <div className='mb-3'>
            <strong>Code File:&nbsp;</strong>
            <span>
              <Link
                href={`/editor/${customMcpServer.code_uuid}`}
                className='text-blue-600 hover:underline'>
                Edit Code
              </Link>
            </span>
            <p className='mt-1 text-sm text-muted-foreground'>
              {customMcpServer.codeFileName || 'No code file name set'}
            </p>
            {customMcpServer.code && (
              <pre className='mt-2 p-2 bg-secondary rounded-md overflow-auto max-h-[400px] font-mono'>
                {customMcpServer.code}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
