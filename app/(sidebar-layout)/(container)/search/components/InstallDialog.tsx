import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { mutate } from 'swr';

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
  // Load 'discover' as the default namespace
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

  useEffect(() => {
    if (open) {
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
  }, [open, serverData, form]);

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
          title: t('common:success'), // Added 'common:' prefix back
          description: t('install.successDescription'), // Belongs to discover namespace
        });

        // Track the installation after successful creation
        if (result.data?.uuid && serverData.external_id && serverData.source) {
          await trackServerInstallation({
            serverUuid: result.data.uuid,
            externalId: serverData.external_id,
            source: serverData.source,
            profileUuid: currentProfile.uuid,
          }).catch(trackError => {
            console.error("Failed to track installation:", trackError);
          });
        } else if (result.data?.uuid && !serverData.external_id) {
           await trackServerInstallation({
            serverUuid: result.data.uuid,
            externalId: result.data.uuid,
            source: McpServerSource.PLUGGEDIN,
            profileUuid: currentProfile.uuid,
          }).catch(trackError => {
            console.error("Failed to track custom installation:", trackError);
          });
        }

        // Refresh the installed servers data
        await mutate(`${currentProfile.uuid}/installed-mcp-servers`);

        onOpenChange(false);
      } else {
        toast({
          title: t('common:error'), // Added 'common:' prefix back
          description: result.error || t('install.errorDescription'), // Belongs to discover namespace
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error installing server:', error);
      toast({
        title: t('common:error'), // Added 'common:' prefix back
        description: t('common:errors.unexpected'), // Used correct key from common.json
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
          <DialogTitle>{t('install.title')}</DialogTitle>
          <DialogDescription>{t('install.description')}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('install.name')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('install.description')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {serverData.type === McpServerType.STDIO ? (
              <>
                <FormField
                  control={form.control}
                  name="command"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('install.command')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="args"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('install.args')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="env"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('install.env')}</FormLabel>
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
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('install.url')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t('common.installing') : t('common.install')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
