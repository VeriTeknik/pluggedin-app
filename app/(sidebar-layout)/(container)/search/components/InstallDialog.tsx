import { useEffect, useMemo,useState } from 'react';
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
  // Load 'discover' as the default namespace and 'common' for shared translations
  const { t } = useTranslation(['discover', 'common']);
  const { currentProfile } = useProfiles();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Parse environment variables to extract keys and descriptions
  const envInfo = useMemo(() => {
    if (!serverData.env) return [];
    return serverData.env.split('\n')
      .filter(line => line.includes('='))
      .map(line => {
        const [keyValue, ...descParts] = line.split('#');
        const [key] = keyValue.split('=');
        const description = descParts.join('#').trim();
        return {
          key: key.trim(),
          description: description || undefined
        };
      });
  }, [serverData.env]);

  // Extract just the keys for backward compatibility
  const envKeys = useMemo(() => {
    return envInfo.map(info => info.key);
  }, [envInfo]);

  // Initialize form with environment variables as separate fields
  const defaultEnvValues = useMemo(() => {
    const values: Record<string, string> = {};
    envKeys.forEach(key => {
      values[`env_${key}`] = '';
    });
    return values;
  }, [envKeys]);

  const form = useForm({
    defaultValues: {
      name: serverData.name,
      description: serverData.description,
      command: serverData.command,
      args: serverData.args,
      env: serverData.env,
      url: serverData.url,
      type: serverData.type,
      ...defaultEnvValues,
    },
  });

  useEffect(() => {
    if (open) {
      const envValues: Record<string, string> = {};
      envKeys.forEach(key => {
        envValues[`env_${key}`] = '';
      });
      
      form.reset({
        name: serverData.name,
        description: serverData.description,
        command: serverData.command,
        args: serverData.args,
        env: serverData.env,
        url: serverData.url,
        type: serverData.type,
        ...envValues,
      });
    }
  }, [open, serverData, form, envKeys]);

  const onSubmit = async (values: any) => {
    if (!currentProfile?.uuid) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Extract environment variables from form fields
      const envObject: Record<string, string> = {};
      Object.keys(values).forEach(key => {
        if (key.startsWith('env_')) {
          const envKey = key.replace('env_', '');
          if (values[key]) {
            envObject[envKey] = values[key];
          }
        }
      });

      const result = await createMcpServer({
        name: values.name,
        profileUuid: currentProfile.uuid,
        description: values.description,
        command: values.command,
        args: values.args.trim().split(/\s+/).filter(Boolean),
        env: envObject,
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

                {envInfo.length > 0 && (
                  <div className="space-y-4">
                    <FormLabel>{t('install.env')}</FormLabel>
                    {envInfo.map((env) => (
                      <FormField
                        key={env.key}
                        control={form.control}
                        name={`env_${env.key}`}
                        render={({ field }) => (
                          <FormItem>
                            <div className="space-y-2">
                              <div className="grid grid-cols-3 gap-4 items-center">
                                <FormLabel className="text-sm font-mono">{env.key}</FormLabel>
                                <FormControl className="col-span-2">
                                  <Input {...field} placeholder="Enter value" />
                                </FormControl>
                              </div>
                              {env.description && (
                                <p className="text-sm text-muted-foreground ml-1">
                                  {env.description}
                                </p>
                              )}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                )}
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
                {t('common:common.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t('common:common.installing') : t('common:common.install')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
