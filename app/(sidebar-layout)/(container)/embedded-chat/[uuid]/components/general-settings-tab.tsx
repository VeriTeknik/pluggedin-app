'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Server } from 'lucide-react';
import { AvatarUpload } from '@/components/ui/avatar-upload';

import { updateEmbeddedChatConfig, getMCPServersForEmbeddedChat } from '@/app/actions/embedded-chat';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { EmbeddedChat } from '@/types/embedded-chat';

interface MCPServer {
  uuid: string;
  name: string;
  type: string;
  status: string;
  description?: string | null;
  profileName: string;
}

const generalSettingsSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  slug: z.string()
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens')
    .min(3, 'Slug must be at least 3 characters')
    .max(50, 'Slug must be at most 50 characters')
    .optional(),
  description: z.string().max(500).optional(),
  welcome_message: z.string().max(1000).optional(),
  custom_instructions: z.string().max(2000).optional(),
  suggested_questions: z.array(z.string().max(200)).max(5),
  enable_rag: z.boolean(),
  is_public: z.boolean(),
  is_active: z.boolean(),
  allowed_domains: z.array(z.string()),
  enabled_mcp_server_uuids: z.array(z.string()),
  bot_avatar_url: z.string().nullable().optional(),
  expose_capabilities: z.boolean(),
});

type GeneralSettingsValues = z.infer<typeof generalSettingsSchema>;

interface GeneralSettingsTabProps {
  chat: EmbeddedChat;
  chatUuid: string;
}

export function GeneralSettingsTab({ chat, chatUuid }: GeneralSettingsTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);

  const form = useForm<GeneralSettingsValues>({
    resolver: zodResolver(generalSettingsSchema),
    defaultValues: {
      name: chat.name,
      slug: chat.slug || undefined,
      description: chat.description || undefined,
      welcome_message: chat.welcome_message || undefined,
      custom_instructions: chat.custom_instructions || undefined,
      suggested_questions: chat.suggested_questions || [],
      enable_rag: chat.enable_rag,
      is_public: chat.is_public,
      is_active: chat.is_active,
      allowed_domains: chat.allowed_domains || [],
      enabled_mcp_server_uuids: chat.enabled_mcp_server_uuids || [],
      bot_avatar_url: chat.bot_avatar_url || null,
      expose_capabilities: chat.expose_capabilities ?? false,
    },
  });

  // Load MCP servers on mount
  useEffect(() => {
    loadMCPServers();
  }, [chat.project_uuid]);

  const loadMCPServers = async () => {
    setLoadingServers(true);
    try {
      const result = await getMCPServersForEmbeddedChat(chat.project_uuid);
      if (result.success && result.data) {
        setMcpServers(result.data as MCPServer[]);
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: 'Failed to load MCP servers',
        variant: 'destructive',
      });
    } finally {
      setLoadingServers(false);
    }
  };

  const onSubmit = async (values: GeneralSettingsValues) => {
    setIsLoading(true);
    try {
      // Filter out empty suggested questions
      const cleanedValues = {
        ...values,
        slug: values.slug?.trim() || null, // Explicitly include slug, trim and convert empty to null
        description: values.description?.trim() || null, // Explicitly include description, trim and convert empty to null
        suggested_questions: values.suggested_questions?.filter(q => q && q.trim()) || [],
        allowed_domains: values.allowed_domains?.filter(d => d && d.trim()) || [],
        bot_avatar_url: values.bot_avatar_url?.trim() || null,
        expose_capabilities: values.expose_capabilities ?? false,
      };
      
      const result = await updateEmbeddedChatConfig(chatUuid, cleanedValues);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update settings');
      }

      toast({
        title: t('common.success'),
        description: t('embeddedChat.settings.updateSuccess', 'Settings updated successfully'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to update settings',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('embeddedChat.general.title', 'General Settings')}</CardTitle>
            <CardDescription>
              {t('embeddedChat.general.description', 'Configure basic settings for your embedded chat')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>{t('embeddedChat.general.botAvatar', 'Bot Avatar')}</Label>
              <FormDescription>
                {t('embeddedChat.general.botAvatarDescription', 'Avatar image displayed for the bot in chat')}
              </FormDescription>
              <AvatarUpload
                currentAvatarUrl={form.watch('bot_avatar_url')}
                onAvatarChange={(url) => form.setValue('bot_avatar_url', url)}
                uploadEndpoint={`/api/embedded-chat/${chatUuid}/avatar`}
                name={chat.name}
                size="md"
              />
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('embeddedChat.general.name', 'Chat Name')}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="AI Assistant" />
                  </FormControl>
                  <FormDescription>
                    {t('embeddedChat.general.nameDescription', 'The name displayed in the chat widget')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('embeddedChat.general.slug', 'URL Slug')}</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="my-assistant" 
                      onChange={(e) => {
                        // Convert to lowercase and replace spaces with hyphens
                        const value = e.target.value.toLowerCase().replace(/\s+/g, '-');
                        field.onChange(value);
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('embeddedChat.general.slugDescription', 'Short URL for accessing this chat (e.g., /to/username/my-assistant)')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('embeddedChat.general.description', 'Description')}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="This AI assistant helps with..."
                      rows={3}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('embeddedChat.general.descriptionDescription', 'A brief description of what this assistant does (shown on your profile)')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="welcome_message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('embeddedChat.general.welcomeMessage', 'Welcome Message')}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Hello! How can I help you today?"
                      rows={3}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('embeddedChat.general.welcomeMessageDescription', 'The first message users see when opening the chat')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="custom_instructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('embeddedChat.general.customInstructions', 'Custom Instructions')}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="You are a helpful assistant..."
                      rows={4}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('embeddedChat.general.customInstructionsDescription', 'System prompt to customize the AI behavior')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4">
              <FormField
                control={form.control}
                name="enable_rag"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        {t('embeddedChat.general.enableRAG', 'Enable Document Search')}
                      </FormLabel>
                      <FormDescription>
                        {t('embeddedChat.general.enableRAGDescription', 'Allow the AI to search through your uploaded documents')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_public"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        {t('embeddedChat.general.isPublic', 'Public Chat')}
                      </FormLabel>
                      <FormDescription>
                        {t('embeddedChat.general.isPublicDescription', 'Make this chat available on your public profile and for public embedding')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        {t('embeddedChat.general.isActive', 'Active')}
                      </FormLabel>
                      <FormDescription>
                        {t('embeddedChat.general.isActiveDescription', 'Enable or disable the chat widget')}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* MCP Server Selection */}
            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold">
                  {t('embeddedChat.general.mcpServers', 'MCP Server Access')}
                </Label>
                <FormDescription className="mt-1">
                  {t('embeddedChat.general.mcpServersDescription', 'Select which MCP servers this chat can access. Leave all unchecked to enable all servers.')}
                </FormDescription>
              </div>
              
              {loadingServers ? (
                <div className="text-sm text-muted-foreground">
                  {t('common.loading')}
                </div>
              ) : mcpServers.length === 0 ? (
                <div className="text-sm text-muted-foreground p-4 border rounded-lg text-center">
                  <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  {t('embeddedChat.general.noMcpServers', 'No MCP servers available. Add servers to your workspaces first.')}
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Group servers by profile/workspace */}
                  {Object.entries(
                    mcpServers.reduce((acc, server) => {
                      if (!acc[server.profileName]) {
                        acc[server.profileName] = [];
                      }
                      acc[server.profileName].push(server);
                      return acc;
                    }, {} as Record<string, MCPServer[]>)
                  ).map(([profileName, servers]) => (
                    <div key={profileName} className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">
                        {profileName}
                      </div>
                      {servers.map((server) => (
                        <FormField
                          key={server.uuid}
                          control={form.control}
                          name="enabled_mcp_server_uuids"
                          render={({ field }) => {
                            const isEnabled = field.value?.includes(server.uuid) || false;
                            return (
                              <FormItem>
                                <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <Server className="h-4 w-4 text-muted-foreground" />
                                      <span className="font-medium">{server.name}</span>
                                      <Badge variant="secondary" className="text-xs">
                                        {server.type}
                                      </Badge>
                                      {server.status === 'ERROR' && (
                                        <Badge variant="destructive" className="text-xs">
                                          Error
                                        </Badge>
                                      )}
                                    </div>
                                    {server.description && (
                                      <p className="text-sm text-muted-foreground mt-1">
                                        {server.description}
                                      </p>
                                    )}
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={isEnabled}
                                      onCheckedChange={(checked) => {
                                        const currentValues = field.value || [];
                                        if (checked) {
                                          field.onChange([...currentValues, server.uuid]);
                                        } else {
                                          field.onChange(currentValues.filter(id => id !== server.uuid));
                                        }
                                      }}
                                    />
                                  </FormControl>
                                </div>
                              </FormItem>
                            );
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>
                    {t('embeddedChat.general.suggestedQuestions', 'Suggested Questions')}
                    <span className="text-muted-foreground text-sm ml-2">(Optional)</span>
                  </Label>
                  <FormDescription>
                    {t('embeddedChat.general.suggestedQuestionsDescription', 'Quick prompts users can click to start a conversation.')}
                  </FormDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const questions = form.getValues('suggested_questions') || [];
                    if (questions.length < 5) {
                      form.setValue('suggested_questions', [...questions, '']);
                    }
                  }}
                  disabled={form.watch('suggested_questions')?.length >= 5}
                >
                  Add Question
                </Button>
              </div>
              {(form.watch('suggested_questions') || []).map((_, index) => (
                <div key={index} className="flex gap-2">
                  <FormField
                    control={form.control}
                    name={`suggested_questions.${index}`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={`Question ${index + 1}`}
                            value={field.value || ''}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const questions = form.getValues('suggested_questions') || [];
                      form.setValue(
                        'suggested_questions',
                        questions.filter((_, i) => i !== index)
                      );
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <Label>{t('embeddedChat.general.allowedDomains', 'Allowed Domains')}</Label>
              <FormDescription>
                {t('embeddedChat.general.allowedDomainsDescription', 'Domains that can embed this chat (leave empty to allow all)')}
              </FormDescription>
              {form.watch('allowed_domains').map((_, index) => (
                <FormField
                  key={index}
                  control={form.control}
                  name={`allowed_domains.${index}`}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input
                            {...field}
                            placeholder="example.com"
                            value={field.value || ''}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const domains = form.getValues('allowed_domains');
                              form.setValue(
                                'allowed_domains',
                                domains.filter((_, i) => i !== index)
                              );
                            }}
                          >
                            {t('common.remove')}
                          </Button>
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const domains = form.getValues('allowed_domains');
                  form.setValue('allowed_domains', [...domains, '']);
                }}
              >
                {t('embeddedChat.general.addDomain', 'Add Domain')}
              </Button>
            </div>

            <FormField
              control={form.control}
              name="expose_capabilities"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      {t('embeddedChat.general.exposeCapabilities', 'Show Capabilities')}
                    </FormLabel>
                    <FormDescription>
                      {t('embeddedChat.general.exposeCapabilitiesDescription', 'Display enabled MCP servers and RAG capabilities to users')}
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isLoading}>
              {isLoading ? t('common.saving') : t('common.saveChanges')}
            </Button>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}