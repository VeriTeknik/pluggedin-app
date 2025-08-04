'use client';

import { BotIcon, ExternalLink, Key, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { createEmbeddedChat, toggleEmbeddedChat, getCurrentProject } from '@/app/actions/embedded-chat';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useProjects } from '@/hooks/use-projects';
import { useToast } from '@/hooks/use-toast';

export function EmbeddedChatSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const { currentProject, mutate } = useProjects();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [embeddedChatEnabled, setEmbeddedChatEnabled] = useState(false);
  const [embeddedChatUuid, setEmbeddedChatUuid] = useState<string | null>(null);

  // Load the full project data on mount
  useEffect(() => {
    if (currentProject) {
      getCurrentProject('').then((fullProject) => {
        if (fullProject) {
          setEmbeddedChatEnabled(fullProject.embedded_chat_enabled ?? false);
          setEmbeddedChatUuid(fullProject.embedded_chat_uuid);
        }
      });
    }
  }, [currentProject]);

  if (!currentProject) {
    return null;
  }

  const handleToggle = async (enabled: boolean) => {
    setIsLoading(true);
    try {
      if (enabled && !embeddedChatUuid) {
        // Create embedded chat
        const result = await createEmbeddedChat({
          projectUuid: currentProject.uuid,
          name: 'AI Assistant',
        });
        if (!result.success) {
          throw new Error(result.error || 'Failed to create embedded chat');
        }
        // Update local state with the new chat UUID
        setEmbeddedChatUuid(result.data?.uuid || null);
        setEmbeddedChatEnabled(true);
      } else {
        // Just toggle the enabled state
        const result = await toggleEmbeddedChat(enabled);
        if (!result.success) {
          throw new Error(result.error || 'Failed to toggle embedded chat');
        }
        // Update local state
        setEmbeddedChatEnabled(enabled);
      }
      
      await mutate();
      
      toast({
        title: t('common.success'),
        description: enabled 
          ? t('settings.embeddedChat.enabledSuccess', 'Embedded chat enabled successfully')
          : t('settings.embeddedChat.disabledSuccess', 'Embedded chat disabled successfully'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to update embedded chat',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfigureClick = () => {
    if (embeddedChatUuid) {
      router.push(`/embedded-chat/${embeddedChatUuid}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BotIcon className="h-5 w-5" />
          {t('settings.embeddedChat.title', 'Embedded Chat')}
        </CardTitle>
        <CardDescription>
          {t('settings.embeddedChat.description', 'Enable AI-powered chat for your hub that can be embedded on external websites')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="font-medium">
              {t('settings.embeddedChat.enable', 'Enable Embedded Chat')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('settings.embeddedChat.enableDescription', 'Allow external websites to embed your hub\'s AI assistant')}
            </p>
          </div>
          <Switch
            checked={embeddedChatEnabled}
            onCheckedChange={handleToggle}
            disabled={isLoading}
          />
        </div>

        {embeddedChatEnabled && embeddedChatUuid && (
          <div className="space-y-4 border-t pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Button
                variant="outline"
                className="justify-start"
                onClick={handleConfigureClick}
              >
                <Settings className="mr-2 h-4 w-4" />
                {t('settings.embeddedChat.configure', 'Configure Chat')}
              </Button>
              
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => router.push(`/embedded-chat/${embeddedChatUuid}/api-keys`)}
              >
                <Key className="mr-2 h-4 w-4" />
                {t('settings.embeddedChat.apiKeys', 'API Keys')}
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              <p className="flex items-center gap-1">
                {t('settings.embeddedChat.embedInfo', 'Your chat can be embedded on external websites.')}
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => router.push(`/embedded-chat/${embeddedChatUuid}/embed`)}
                >
                  {t('settings.embeddedChat.getCode', 'Get embed code')}
                  <ExternalLink className="ml-1 h-3 w-3" />
                </Button>
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}