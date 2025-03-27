import { Database, Download, ExternalLink, Github, Package } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
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
import { McpServerSource, McpServerType } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles';
import { McpServerCategory, SearchIndex } from '@/types/search';
import { getCategoryIcon } from '@/utils/categories';

interface AddMcpServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultValues: {
    name: string;
    description: string;
    command: string;
    args: string;
    env: string;
    url: string | undefined;
    type: McpServerType;
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
        type: values.type,
        url: values.url,
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
            {form.getValues('type') === McpServerType.STDIO ? (
              <>
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
              </>
            ) : (
              <FormField
                control={form.control}
                name='url'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('search.card.dialog.url')}</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        value={field.value || ''} 
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
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

// Helper function to get source icon
function SourceBadge({ source }: { source?: McpServerSource }) {
  const { t } = useTranslation();
  
  switch (source) {
    case McpServerSource.SMITHERY:
      return (
        <Badge variant="outline" className="gap-1">
          <Database className="h-3 w-3" />
          Smithery
        </Badge>
      );
    case McpServerSource.NPM:
      return (
        <Badge variant="outline" className="gap-1">
          <Package className="h-3 w-3" />
          NPM
        </Badge>
      );
    case McpServerSource.GITHUB:
      return (
        <Badge variant="outline" className="gap-1">
          <Github className="h-3 w-3" />
          GitHub
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <Database className="h-3 w-3" />
          PluggedIn
        </Badge>
      );
  }
}

// Helper function to get category badge
function CategoryBadge({ category }: { category?: McpServerCategory }) {
  const { t } = useTranslation();
  
  if (!category) return null;
  
  const iconName = getCategoryIcon(category);
  const IconComponent = (LucideIcons as Record<string, any>)[iconName];
  
  return (
    <Badge variant="secondary" className="gap-1">
      {IconComponent && <IconComponent className="h-3 w-3" />}
      {t(`search.categories.${category}`)}
    </Badge>
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
    url: string | undefined;
    type: McpServerType;
  } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleInstallClick = (key: string, item: any) => {
    // Determine if this is a stdio or SSE server
    const isSSE = item.url || false;
    
    setSelectedItem({
      name: item.name,
      description: item.description,
      command: isSSE ? '' : item.command,
      args: isSSE ? '' : item.args?.join(' ') || '',
      env: isSSE ? '' : item.envs?.map((env: string) => env).join('\n') || '',
      url: isSSE ? item.url : undefined,
      type: isSSE ? McpServerType.SSE : McpServerType.STDIO,
    });
    setDialogOpen(true);
  };

  return (
    <>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
        {Object.entries(items).map(([key, item]) => (
          <Card key={key} className='flex flex-col'>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="mr-2">{item.name}</CardTitle>
                <SourceBadge source={item.source} />
              </div>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent className='flex-grow pb-2'>
              {item.package_name && (
                <p className='text-sm text-muted-foreground mb-2'>
                  {t('search.card.package')}: {item.package_name}
                </p>
              )}
              {item.command && (
                <p className='text-sm text-muted-foreground mb-2'>
                  {t('search.card.command')}: {item.command}
                </p>
              )}
              {item.args?.length > 0 && (
                <p className='text-sm text-muted-foreground mb-2'>
                  {t('search.card.exampleArgs')}: {item.args.join(' ')}
                </p>
              )}
              
              <div className="flex flex-wrap gap-2 mt-2">
                {item.category && (
                  <CategoryBadge category={item.category} />
                )}
                
                {item.envs?.map((env: string) => (
                  <Badge key={env} variant='secondary'>
                    {env}
                  </Badge>
                ))}
                
                {item.tags?.map((tag: string) => (
                  <Badge key={tag} variant='outline'>
                    {tag}
                  </Badge>
                ))}
              </div>
              
              {item.useCount !== undefined && (
                <p className='text-xs text-muted-foreground mt-2'>
                  {t('search.card.usageCount')}: {item.useCount}
                </p>
              )}
            </CardContent>
            <CardFooter className='flex justify-between pt-2'>
              {item.githubUrl && (
                <Button variant='outline' asChild size="sm">
                  <Link
                    href={item.githubUrl}
                    target='_blank'
                    rel='noopener noreferrer'>
                    <Github className='w-4 h-4 mr-2' />
                    GitHub
                  </Link>
                </Button>
              )}
              
              {item.qualifiedName && (
                <Button variant='outline' asChild size="sm">
                  <Link
                    href={`/api/service/search/${item.qualifiedName}`}
                    target='_blank'
                    rel='noopener noreferrer'>
                    <ExternalLink className='w-4 h-4 mr-2' />
                    Details
                  </Link>
                </Button>
              )}
              
              <Button
                variant='default'
                size="sm"
                onClick={() => handleInstallClick(key, item)}>
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
