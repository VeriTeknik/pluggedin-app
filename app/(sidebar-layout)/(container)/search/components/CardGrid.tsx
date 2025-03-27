import { Download, Github } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { createMcpServer } from '@/app/actions/mcp-servers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from '@/components/ui/textarea';
import { McpServerType } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles';
import { SearchIndex } from '@/types/search';

interface AddMcpServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues: {
    name: string;
    description: string;
    command: string;
    args: string;
    env: string;
  };
}

function AddMcpServerDialog({
  open,
  onOpenChange,
  defaultValues,
}: AddMcpServerDialogProps) {
  const { t } = useTranslation();
  const { currentProfile } = useProfiles();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    defaultValues,
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  const onSubmit = async (values: typeof defaultValues) => {
    if (!currentProfile?.uuid) return;

    setIsSubmitting(true);
    try {
      await createMcpServer(currentProfile.uuid, {
        name: values.name,
        description: values.description,
        command: values.command,
        args: values.args.trim().split(/\s+/).filter(Boolean),
        env: Object.fromEntries(
          values.env
            .split('\n')
            .filter((line) => line.includes('='))
            .map((line) => {
              const [key, ...values] = line.split('=');
              return [key.trim(), values.join('=').trim()];
            })
        ),
        type: McpServerType.STDIO,
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('search.card.dialog.title')}</DialogTitle>
          <DialogDescription>
            {t('search.card.dialog.description')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('search.card.dialog.name')}</FormLabel>
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
                  <FormLabel>{t('search.card.dialog.description')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
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
                  <FormLabel>{t('search.card.dialog.command')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
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
                  <FormLabel>{t('search.card.dialog.args')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
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
                  <FormLabel>{t('search.card.dialog.env')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='flex justify-end gap-4'>
              <Button
                variant='outline'
                type='button'
                onClick={() => onOpenChange(false)}>
                {t('search.card.dialog.cancel')}
              </Button>
              <Button type='submit' disabled={isSubmitting}>
                {t('search.card.dialog.add')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function CardGrid({ items }: { items: SearchIndex }) {
  const { t } = useTranslation();
  const [selectedItem, setSelectedItem] = useState<{
    name: string;
    description: string;
    command: string;
    args: string;
    env: string;
  } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
        {Object.entries(items).map(([key, item]) => (
          <Card key={key} className='flex flex-col'>
            <CardHeader>
              <CardTitle>{item.name}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent className='flex-grow'>
              <p className='text-sm text-muted-foreground mb-2'>
                {t('search.card.package')}: {item.package_name}
              </p>
              <p className='text-sm text-muted-foreground mb-2'>
                {t('search.card.command')}: {item.command}
              </p>
              {item.args && (
                <p className='text-sm text-muted-foreground mb-2'>
                  {t('search.card.exampleArgs')}: {item.args.join(' ')}
                </p>
              )}
              {item.envs.length > 0 && (
                <div className='flex flex-wrap gap-2 mt-2'>
                  {item.envs.map((env) => (
                    <Badge key={env} variant='secondary'>
                      {env}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className='flex justify-between'>
              {item.githubUrl && (
                <Button variant='outline' asChild>
                  <Link
                    href={item.githubUrl}
                    target='_blank'
                    rel='noopener noreferrer'>
                    <Github className='w-4 h-4 mr-2' />
                    GitHub
                  </Link>
                </Button>
              )}
              <Button
                variant='default'
                onClick={() => {
                  setSelectedItem({
                    name: item.name,
                    description: item.description,
                    command: item.command,
                    args: item.args?.join(' ') || '',
                    env: item.envs?.join().length
                      ? item.envs.join('=\n') + '='
                      : '',
                  });
                  setDialogOpen(true);
                }}>
                <Download className='w-4 h-4 mr-2' />
                {t('search.card.install')}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      {selectedItem && (
        <AddMcpServerDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          defaultValues={selectedItem}
        />
      )}
    </>
  );
}
