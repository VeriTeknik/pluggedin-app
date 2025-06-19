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
import * as dotenv from 'dotenv';
import { Check, ChevronsUpDown, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import useSWR from 'swr';

import {
  createCustomMcpServer,
  deleteCustomMcpServerByUuid,
  getCustomMcpServers,
  toggleCustomMcpServerStatus,
} from '@/app/actions/custom-mcp-servers';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { McpServerStatus } from '@/db/schema';
import { useCodes } from '@/hooks/use-codes';
import { useProfiles } from '@/hooks/use-profiles';
import { cn } from '@/lib/utils';
import { CustomMcpServer } from '@/types/custom-mcp-server';
import { CreateCustomMcpServerData } from '@/types/custom-mcp-server';

const columnHelper = createColumnHelper<CustomMcpServer>();

interface Code {
  uuid: string;
  fileName: string;
}

export default function CustomMCPServersPage() {
  const { currentProfile } = useProfiles();
  const profileUuid = currentProfile?.uuid;
  const { toast } = useToast();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [openCombobox, setOpenCombobox] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
      code: '',
      additionalArgs: '',
      env: '',
    },
  });

  const { data: servers = [], mutate } = useSWR(
    profileUuid ? `${profileUuid}/custom-mcp-servers` : null,
    () => getCustomMcpServers(profileUuid || '')
  );

  const { codes } = useCodes();

  const columns = [
    columnHelper.accessor('name', {
      cell: (info) => (
        <Link
          href={`/custom-mcp-servers/${info.row.original.uuid}`}
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
    columnHelper.accessor('code', {
      cell: (info) => (
        <Link
          href={`/editor/${info.row.original.code_uuid}`}
          className='text-blue-600 hover:underline'>
          View Code
        </Link>
      ),
      header: 'Code',
    }),
    columnHelper.accessor('additionalArgs', {
      cell: (info) => info.getValue().join(' '),
      header: 'Additional Args',
    }),
    columnHelper.accessor('created_at', {
      cell: (info) => new Date(info.getValue()).toLocaleString(),
      header: 'Created At',
    }),
    columnHelper.accessor('status', {
      cell: (info) => (
        <Switch
          checked={info.getValue() === McpServerStatus.ACTIVE}
          onCheckedChange={async (checked) => {
            if (!profileUuid || !info.row.original.uuid) {
              return;
            }
            await toggleCustomMcpServerStatus(
              profileUuid,
              info.row.original.uuid,
              checked ? McpServerStatus.ACTIVE : McpServerStatus.INACTIVE
            );
            mutate();
          }}
        />
      ),
      header: 'Status',
    }),
    columnHelper.display({
      id: 'actions',
      cell: (info) => (
        <Button
          variant='destructive'
          size='sm'
          onClick={async () => {
            if (!profileUuid) return;
            if (
              confirm('Are you sure you want to delete this custom MCP server?')
            ) {
              await deleteCustomMcpServerByUuid(
                profileUuid,
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
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const onSubmit = async (values: any) => {
    if (!profileUuid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const additionalArgs = values.additionalArgs.trim().split(/\s+/).filter(Boolean);
      let env: Record<string, string> = {};
      try {
        // Use dotenv.parse for secure parsing that handles quotes, multiline values, etc.
        env = dotenv.parse(values.env || '');
      } catch (e) {
        console.error('Failed to parse env:', e);
        toast({
          title: 'Error',
          description: 'Invalid environment variables format',
          variant: 'destructive',
        });
        setIsSubmitting(false);
        return;
      }

      await createCustomMcpServer(profileUuid, {
        name: values.name,
        description: values.description,
        code_uuid: values.code,
        additionalArgs,
        env,
      } as CreateCustomMcpServerData);

      form.reset();
      setOpen(false);
      mutate();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className='flex justify-between items-center mb-4'>
        <div>
          <h1 className='text-2xl font-bold'>Custom MCP Servers</h1>
          <p className='text-muted-foreground'>
            Manage your custom MCP server (python code based) configurations
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Add Custom MCP Server</Button>
          </DialogTrigger>
          <DialogContent className='sm:max-w-[425px]'>
            <DialogHeader>
              <DialogTitle>Add Custom MCP Server</DialogTitle>
              <DialogDescription>
                Create a new custom MCP server configuration. Code and
                additional arguments will be used to start the server.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className='space-y-4 pt-4'>
                <FormField
                  control={form.control}
                  name='name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
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
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='code'
                  render={({ field }) => (
                    <FormItem className='flex flex-col'>
                      <FormLabel>Code</FormLabel>
                      <Popover
                        open={openCombobox}
                        onOpenChange={setOpenCombobox}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant='outline'
                              role='combobox'
                              aria-expanded={openCombobox}
                              className={cn(
                                'w-full justify-between',
                                !field.value && 'text-muted-foreground'
                              )}>
                              {field.value
                                ? codes?.find(
                                    (code: Code) => code.uuid === field.value
                                  )?.fileName
                                : 'Select code...'}
                              <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className='w-full p-0'>
                          <Command>
                            <CommandList>
                              <CommandInput placeholder='Search code...' />
                              <CommandEmpty>No code found.</CommandEmpty>
                              <CommandGroup>
                                {codes?.map((code: Code) => {
                                  return (
                                    <CommandItem
                                      key={code.uuid}
                                      value={code.uuid}
                                      onSelect={() => {
                                        field.onChange(code.uuid);
                                        setOpenCombobox(false);
                                      }}>
                                      <Check
                                        className={cn(
                                          'mr-2 h-4 w-4',
                                          field.value === code.uuid
                                            ? 'opacity-100'
                                            : 'opacity-0'
                                        )}
                                      />
                                      {code?.fileName}
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        Select the code snippet that will be executed for this server.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='additionalArgs'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Additional Arguments (space-separated)
                      </FormLabel>
                      <FormControl>
                        <Input placeholder='e.g., -y --arg2' {...field} />
                      </FormControl>
                      <FormDescription>
                        These arguments will be passed to the selected code script upon execution.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='env'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Environment Variables (KEY=value, one per line)
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder='KEY=value                                                                                ANOTHER_KEY=another_value'
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type='submit' disabled={isSubmitting}>
                  {isSubmitting ? 'Adding...' : 'Add Server'}
                </Button>
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
