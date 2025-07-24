'use client';

import { Copy, Eye, EyeOff, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  generateEmbeddedChatApiKey,
  regenerateEmbeddedChatApiKey,
  revokeEmbeddedChatApiKey,
  toggleApiKeyRequirement,
} from '@/app/actions/embedded-chat';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { EmbeddedChat } from '@/types/embedded-chat';

interface ApiKeysTabProps {
  chat: EmbeddedChat;
  chatUuid: string;
}

export function ApiKeysTab({ chat: initialChat, chatUuid }: ApiKeysTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [chat, setChat] = useState(initialChat);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerateApiKey = async () => {
    setIsLoading(true);
    try {
      const result = await generateEmbeddedChatApiKey(chatUuid);
      
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to generate API key');
      }

      setChat(result.data);
      setShowApiKey(true);
      
      toast({
        title: t('common.success'),
        description: t('embeddedChat.apiKeys.generateSuccess', 'API key generated successfully'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to generate API key',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateApiKey = async () => {
    if (!window.confirm(t('embeddedChat.apiKeys.regenerateConfirm', 'Are you sure? This will invalidate the existing API key.'))) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await regenerateEmbeddedChatApiKey(chatUuid);
      
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to regenerate API key');
      }

      setChat(result.data);
      setShowApiKey(true);
      
      toast({
        title: t('common.success'),
        description: t('embeddedChat.apiKeys.regenerateSuccess', 'API key regenerated successfully'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to regenerate API key',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeApiKey = async () => {
    if (!window.confirm(t('embeddedChat.apiKeys.revokeConfirm', 'Are you sure? This will permanently delete the API key.'))) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await revokeEmbeddedChatApiKey(chatUuid);
      
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to revoke API key');
      }

      setChat(result.data);
      
      toast({
        title: t('common.success'),
        description: t('embeddedChat.apiKeys.revokeSuccess', 'API key revoked successfully'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to revoke API key',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleRequirement = async (required: boolean) => {
    setIsLoading(true);
    try {
      const result = await toggleApiKeyRequirement(chatUuid, required);
      
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to update API key requirement');
      }

      setChat(result.data);
      
      toast({
        title: t('common.success'),
        description: required 
          ? t('embeddedChat.apiKeys.requirementEnabled', 'API key requirement enabled')
          : t('embeddedChat.apiKeys.requirementDisabled', 'API key requirement disabled'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to update API key requirement',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyApiKey = () => {
    if (chat.api_key) {
      navigator.clipboard.writeText(chat.api_key);
      toast({
        title: t('common.success'),
        description: t('embeddedChat.apiKeys.copySuccess', 'API key copied to clipboard'),
      });
    }
  };

  const maskedApiKey = chat.api_key 
    ? `${chat.api_key.substring(0, 7)}...${chat.api_key.substring(chat.api_key.length - 4)}`
    : '';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('embeddedChat.apiKeys.title', 'API Key Authentication')}</CardTitle>
          <CardDescription>
            {t('embeddedChat.apiKeys.description', 'Manage API keys for secure access to your embedded chat')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base">
                {t('embeddedChat.apiKeys.requireApiKey', 'Require API Key')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('embeddedChat.apiKeys.requireApiKeyDescription', 'Only allow access with a valid API key')}
              </p>
            </div>
            <Switch
              checked={chat.require_api_key}
              onCheckedChange={handleToggleRequirement}
              disabled={isLoading || !chat.api_key}
            />
          </div>

          {!chat.api_key ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                {t('embeddedChat.apiKeys.noApiKey', 'No API key generated yet')}
              </p>
              <Button onClick={handleGenerateApiKey} disabled={isLoading}>
                {t('embeddedChat.apiKeys.generate', 'Generate API Key')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('embeddedChat.apiKeys.currentKey', 'Current API Key')}</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-muted rounded-md font-mono text-sm">
                    {showApiKey ? chat.api_key : maskedApiKey}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyApiKey}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {chat.api_key_created_at && (
                <div className="text-sm text-muted-foreground">
                  {t('embeddedChat.apiKeys.createdAt', 'Created on')}: {new Date(chat.api_key_created_at).toLocaleDateString()}
                </div>
              )}

              {chat.api_key_last_used_at && (
                <div className="text-sm text-muted-foreground">
                  {t('embeddedChat.apiKeys.lastUsed', 'Last used')}: {new Date(chat.api_key_last_used_at).toLocaleDateString()}
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={handleRegenerateApiKey}
                  disabled={isLoading}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t('embeddedChat.apiKeys.regenerate', 'Regenerate')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleRevokeApiKey}
                  disabled={isLoading}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('embeddedChat.apiKeys.revoke', 'Revoke')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('embeddedChat.apiKeys.usageTitle', 'How to Use')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              {t('embeddedChat.apiKeys.usageDescription', 'Include the API key when embedding the chat:')}
            </p>
            <code className="block px-3 py-2 bg-muted rounded-md font-mono text-sm">
              {'<script src="https://plugged.in/embed/'}
              {chatUuid}
              {'.js?key=YOUR_API_KEY"></script>'}
            </code>
          </div>
          
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              {t('embeddedChat.apiKeys.headerDescription', 'Or include it in the Authorization header:')}
            </p>
            <code className="block px-3 py-2 bg-muted rounded-md font-mono text-sm">
              Authorization: Bearer YOUR_API_KEY
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}