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
import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import useSWR from 'swr';

import {
  createMcpServer,
  deleteMcpServerByUuid,
  getMcpServers,
  toggleMcpServerStatus,
} from '@/app/actions/mcp-servers';
import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { McpServerStatus } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles';
import { McpServer } from '@/types/mcp-server';

const columnHelper = createColumnHelper<McpServer>();

export default function MCPServersPage() {
  const { currentProfile } = useProfiles();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
      command: '',
      args: '',
      env: '',
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
          className='text-blue-600 hover:underline'>
          {info.getValue()}
        </Link>
      ),
      header: 'Name',
    }),
    columnHelper.accessor('description', {
      cell: (info) => info.getValue(),
      header: 'Description',
    }),
    columnHelper.accessor('command', {
      cell: (info) => info.getValue(),
      header: 'Command',
    }),
    columnHelper.accessor('args', {
      cell: (info) => info.getValue().join(' '),
      header: 'Arguments',
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

  return (
    <div>
      <div className='flex justify-between items-center mb-4'>
        <h1 className='text-2xl font-bold'>MCP Servers</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add MCP Server</Button>
          </DialogTrigger>
          <DialogContent className='sm:max-w-[425px]'>
            <DialogHeader>
              <DialogTitle>Add MCP Server</DialogTitle>
              <DialogDescription>
                Create a new MCP server configuration. Command and arguments
                will be used to start the server.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(async (data) => {
                  if (!currentProfile?.uuid) return;
                  setIsSubmitting(true);
                  try {
                    const processedData = {
                      ...data,
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
                      status: 'ACTIVE',
                    };

                    await createMcpServer(currentProfile.uuid, processedData);

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
                          placeholder='e.g. mcp-server-time'
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
                          placeholder='e.g. npx or uvx'
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
                          placeholder='e.g. mcp-server-time, --local-timezone=America/Los_Angeles'
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
                          placeholder='KEY=value                                                     ANOTHER_KEY=another_value'
                          className='font-mono text-sm'
                        />
                      </FormControl>
                      <p className='text-sm text-muted-foreground'>
                        Enter environment variables in KEY=value format, one per
                        line
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
          </DialogContent>
        </Dialog>
      </div>
      <div className='mb-4'>
        <Input
          placeholder='Search all columns...'
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(String(e.target.value))}
          className='max-w-sm'
        />
      </div>
      <div className='overflow-x-auto'>
        <table className='min-w-full bg-white border border-gray-300'>
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
    </div>
  );
}
