import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { trackServerInstallation } from '@/app/actions/mcp-server-metrics'; // Import trackServerInstallation
import { createMcpServer } from '@/app/actions/mcp-servers';
import { Button } from '@/components/ui/button';
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
import { useToast } from '@/components/ui/use-toast';
import { McpServerSource, McpServerType } from '@/db/schema';
import { useProfiles } from '@/hooks/use-profiles';

interface InstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverData: {
    name: string;
    description: string;
    command: string;
    args: string;
    env: string;
    url: string | undefined;
    type: McpServerType;
    source?: McpServerSource;
    external_id?: string;
  };
}

export function InstallDialog({
  open,
  onOpenChange,
  serverData,
}: InstallDialogProps) {
  const { t } = useTranslation('discover');
  const { currentProfile } = useProfiles();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    defaultValues: {
      name: serverData.name,
      description: serverData.description,
      command: serverData.command,
      args: serverData.args,
      env: serverData.env,
      url: serverData.url,
      type: serverData.type,
    },
  });

  // Reset form when serverData changes
  useEffect(() => {
    if (serverData) {
      form.reset({
        name: serverData.name,
        description: serverData.description,
        command: serverData.command,
        args: serverData.args,
        env: serverData.env,
        url: serverData.url,
        type: serverData.type,
      });
    }
  }, [serverData, form.reset]);

  const onSubmit = async (values: {
    name: string;
    description: string;
    command: string;
    args: string;
    env: string;
    url: string | undefined;
    type: McpServerType;
  }) => {
    if (!currentProfile?.uuid) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createMcpServer({
        name: values.name,
        profileUuid: currentProfile.uuid,
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
        source: serverData.source,
        external_id: serverData.external_id,
      });
      
      if (result.success) {
        toast({
          title: 'Success',
          description: 'Server installed successfully',
        });

        // Track the installation after successful creation
        // Access the UUID via result.data.uuid
        if (result.data?.uuid && serverData.external_id && serverData.source) {
          await trackServerInstallation({
            serverUuid: result.data.uuid, // Correct property access
            externalId: serverData.external_id,
            source: serverData.source,
            profileUuid: currentProfile.uuid,
          }).catch(trackError => {
            console.error("Failed to track installation:", trackError);
            // Non-critical, don't show error to user
          });
        } else if (result.data?.uuid && !serverData.external_id) {
           // Handle case where it's a custom server (no external_id/source)
           await trackServerInstallation({
            serverUuid: result.data.uuid, // Correct property access
            externalId: result.data.uuid, // Use serverUuid as externalId for custom
            source: McpServerSource.PLUGGEDIN, // Mark as PLUGGEDIN source
            profileUuid: currentProfile.uuid,
          }).catch(trackError => {
            console.error("Failed to track custom installation:", trackError);
          });
        }

        onOpenChange(false);
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to install server',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error installing server:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
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
                {isSubmitting ? t('search.card.dialog.installing') : t('search.card.dialog.add')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
