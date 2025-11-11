import { Package } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { mutate } from 'swr';

import { trackServerInstallation } from '@/app/actions/mcp-server-metrics'; // Import trackServerInstallation
import { createMcpServer } from '@/app/actions/mcp-servers';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
    args: string | string[];
    env: string;
    url: string | undefined;
    type: McpServerType;
    transport?: string; // Transport type from registry
    headers?: Record<string, string>; // HTTP headers for streamable-http servers
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
  const profileData = useProfiles();
  const currentProfile = profileData.currentProfile;
  const activeProfile = profileData.activeProfile;
  const profilesLoading = profileData.isLoading;
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const profileUuid = currentProfile?.uuid ?? activeProfile?.uuid;
  const isProfileUnavailable = !profilesLoading && !profileUuid;

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
      args: Array.isArray(serverData.args) ? serverData.args.join(' ') : serverData.args,
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
        args: Array.isArray(serverData.args) ? serverData.args.join(' ') : serverData.args,
        env: serverData.env,
        url: serverData.url,
        type: serverData.type,
        ...envValues,
      });
    }
  }, [open, serverData, form, envKeys]);

  const onSubmit = async (values: any) => {
    if (!profileUuid) {
      toast({
        title: t('common:error'),
        description: t('install.profileUnavailable', 'We could not access your active workspace. Please select a workspace and try again.'),
        variant: 'destructive',
      });
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

      // For streamable-http servers, merge headers and env vars into streamableHTTPOptions
      let streamableHTTPOptions: any = undefined;
      if (values.type === McpServerType.STREAMABLE_HTTP) {
        const headers: Record<string, string> = {};

        // 1. Start with registry headers if available
        if (serverData.headers) {
          Object.assign(headers, serverData.headers);
        }

        // 2. Convert common env var patterns to headers
        // Common patterns: API_KEY, X_API_KEY, AUTHORIZATION, etc.
        Object.entries(envObject).forEach(([key, value]) => {
          const upperKey = key.toUpperCase();

          // Pattern 1: *_API_KEY → Authorization: Bearer <value>
          if (upperKey.includes('API_KEY') || upperKey.includes('APIKEY')) {
            if (!headers['Authorization']) {
              headers['Authorization'] = `Bearer ${value}`;
            }
          }
          // Pattern 2: AUTHORIZATION → Authorization: <value>
          else if (upperKey === 'AUTHORIZATION' || upperKey === 'AUTH') {
            headers['Authorization'] = value;
          }
          // Pattern 3: X_* → X-*: <value> (custom headers)
          else if (upperKey.startsWith('X_')) {
            const headerName = key.replace(/_/g, '-');
            headers[headerName] = value;
          }
          // Pattern 4: Anything else with underscore → kebab-case header
          else if (key.includes('_')) {
            const headerName = key.replace(/_/g, '-');
            headers[headerName] = value;
          }
        });

        streamableHTTPOptions = { headers };
      }

      const result = await createMcpServer({
        name: values.name,
        profileUuid,
        description: values.description,
        command: values.command,
        args: values.args ? values.args.trim().split(/\s+/).filter(Boolean) : [],
        env: envObject,
        type: values.type,
        url: values.url,
        transport: serverData.transport as 'streamable_http' | 'sse' | 'stdio' | undefined,
        streamableHTTPOptions,
        source: serverData.source,
        external_id: serverData.external_id,
      });
      
      if (result.success) {
        toast({
          title: t('common:success'), // Added 'common:' prefix back
          description: t('install.successDescription'), // Belongs to discover namespace
        });

        // Track the installation after successful creation
        const serverId = serverData.external_id || result.data?.uuid || serverData.name;
        
        // Analytics tracking removed - will be replaced with new analytics service
        
        // Track to metrics (existing functionality)
        if (result.data?.uuid && serverData.external_id && serverData.source) {
          await trackServerInstallation({
            serverUuid: result.data.uuid,
            externalId: serverData.external_id,
            source: serverData.source,
            profileUuid,
          }).catch(trackError => {
            console.error("Failed to track installation:", trackError);
          });
        } else if (result.data?.uuid && !serverData.external_id) {
           await trackServerInstallation({
            serverUuid: result.data.uuid,
            externalId: result.data.uuid,
            source: McpServerSource.PLUGGEDIN,
            profileUuid,
          }).catch(trackError => {
            console.error("Failed to track custom installation:", trackError);
          });
        }

        // Refresh the installed servers data
        await mutate(`${profileUuid}/installed-mcp-servers`);

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
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 px-4 py-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg">
            {t('install.title')}
            {serverData.source === McpServerSource.REGISTRY && (
              <Badge className="bg-blue-600 hover:bg-blue-700 text-xs">
                <Package className="h-3 w-3 mr-1" />
                Registry
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-sm">{t('install.description')}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {serverData.source === McpServerSource.REGISTRY && (
            <Alert className="mb-3">
              <Package className="h-4 w-4" />
              <AlertDescription className="text-sm">
                {t('install.registryNotice', 'This server is from the official Plugged.in Registry and has been verified for compatibility.')}
              </AlertDescription>
            </Alert>
          )}
          {isProfileUnavailable && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription className="text-sm">
                {t('install.profileUnavailable', 'We could not access your active workspace. Please select or create a workspace before installing.')}
              </AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">{t('install.name')}</FormLabel>
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
                    <FormLabel className="text-sm">{t('install.description')}</FormLabel>
                    <FormControl>
                      <Textarea {...field} className="min-h-[80px]" />
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
                        <FormLabel className="text-sm">{t('install.command')}</FormLabel>
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
                        <FormLabel className="text-sm">{t('install.args')}</FormLabel>
                        <FormControl>
                          <Input {...field} />
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
                      <FormLabel className="text-sm">{t('install.url')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {envInfo.length > 0 && (
                <div className="space-y-3">
                  <FormLabel className="text-sm">{t('install.env')}</FormLabel>
                  {envInfo.map((env) => (
                    <FormField
                      key={env.key}
                      control={form.control}
                      name={`env_${env.key}` as any}
                      render={({ field }) => (
                        <FormItem>
                          <div className="space-y-1">
                            <div className="grid grid-cols-3 gap-3 items-center">
                              <FormLabel className="text-xs font-mono">{env.key}</FormLabel>
                              <FormControl className="col-span-2">
                                <Input {...field} placeholder="Enter value" className="text-sm" />
                              </FormControl>
                            </div>
                            {env.description && (
                              <p className="text-xs text-muted-foreground ml-1">
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
            </form>
          </Form>
        </div>

        <div className="flex-shrink-0 border-t px-4 py-3">
          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              size="sm"
            >
              {t('common:common.cancel')}
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || isProfileUnavailable}
              size="sm"
              onClick={form.handleSubmit(onSubmit)}
            >
              {isSubmitting ? t('common:common.installing') : t('common:common.install')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
