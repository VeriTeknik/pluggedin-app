'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { updateEmbeddedChatConfig } from '@/app/actions/embedded-chat';
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

const generalSettingsSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  welcome_message: z.string().max(1000).optional(),
  custom_instructions: z.string().max(2000).optional(),
  suggested_questions: z.array(z.string().max(200)).max(5),
  enable_rag: z.boolean(),
  is_public: z.boolean(),
  is_active: z.boolean(),
  allowed_domains: z.array(z.string()).default([]),
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

  const form = useForm<GeneralSettingsValues>({
    resolver: zodResolver(generalSettingsSchema),
    defaultValues: {
      name: chat.name,
      welcome_message: chat.welcome_message || '',
      custom_instructions: chat.custom_instructions || '',
      suggested_questions: chat.suggested_questions || [],
      enable_rag: chat.enable_rag,
      is_public: chat.is_public,
      is_active: chat.is_active,
      allowed_domains: chat.allowed_domains || [],
    },
  });

  const onSubmit = async (values: GeneralSettingsValues) => {
    setIsLoading(true);
    try {
      const result = await updateEmbeddedChatConfig(chatUuid, values);
      
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
                        {t('embeddedChat.general.isPublicDescription', 'Make this chat available for public embedding')}
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

            <div className="space-y-4">
              <Label>{t('embeddedChat.general.suggestedQuestions', 'Suggested Questions')}</Label>
              <FormDescription>
                {t('embeddedChat.general.suggestedQuestionsDescription', 'Quick prompts users can click to start a conversation')}
              </FormDescription>
              {[0, 1, 2, 3, 4].map((index) => (
                <FormField
                  key={index}
                  control={form.control}
                  name={`suggested_questions.${index}`}
                  render={({ field }) => (
                    <FormItem>
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

            <Button type="submit" disabled={isLoading}>
              {isLoading ? t('common.saving') : t('common.saveChanges')}
            </Button>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}