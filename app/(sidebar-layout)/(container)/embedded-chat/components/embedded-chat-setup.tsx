'use client';

import { Bot, CheckCircle, Code, MessageSquare, Shield, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createEmbeddedChat, toggleEmbeddedChat } from '@/app/actions/embedded-chat';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface EmbeddedChatSetupProps {
  project: {
    uuid: string;
    name: string;
    embedded_chat_enabled: boolean;
    embedded_chat_uuid: string | null;
  };
}

export function EmbeddedChatSetup({ project }: EmbeddedChatSetupProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleEnableChat = async () => {
    setIsLoading(true);
    try {
      // Create embedded chat if it doesn't exist
      if (!project.embedded_chat_uuid) {
        const result = await createEmbeddedChat({
          projectUuid: project.uuid,
          name: `${project.name} Assistant`,
          welcome_message: t('embeddedChat.defaultWelcome', 'Hello! How can I help you today?'),
        });
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to create embedded chat');
        }
        
        // Redirect to the dashboard
        router.push('/embedded-chat/dashboard');
      } else {
        // Just enable the existing chat
        const result = await toggleEmbeddedChat(true);
        if (!result.success) {
          throw new Error(result.error || 'Failed to enable embedded chat');
        }
        
        // Redirect to dashboard
        router.push('/embedded-chat/dashboard');
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : 'Failed to enable embedded chat',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <MessageSquare className="h-8 w-8 text-primary" />
        </div>
        <div className="text-sm text-muted-foreground mb-2">
          Hub: <span className="font-medium">{project.name}</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t('embeddedChat.setup.title', 'Enable Embedded Chat')}
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">
          {t('embeddedChat.setup.subtitle', 'Add an AI-powered chat assistant to your website')}
        </p>
      </div>

      <div className="mb-8 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              {t('embeddedChat.features.ai.title', 'AI Assistant')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('embeddedChat.features.ai.description', 'Powered by your MCP servers and RAG documents to provide accurate, contextual responses')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              {t('embeddedChat.features.embed.title', 'Easy Integration')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('embeddedChat.features.embed.description', 'Simple embed code that works on any website with just a few lines of JavaScript')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t('embeddedChat.features.security.title', 'Secure & Private')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('embeddedChat.features.security.description', 'API key authentication and domain restrictions keep your chat secure')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              {t('embeddedChat.features.customize.title', 'Fully Customizable')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('embeddedChat.features.customize.description', 'Customize appearance, behavior, and AI model to match your brand')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {t('embeddedChat.setup.ready', 'Ready to get started?')}
          </CardTitle>
          <CardDescription className="text-base">
            {t('embeddedChat.setup.readyDescription', 'Enable embedded chat for your hub and start engaging with your website visitors')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button
            size="lg"
            onClick={handleEnableChat}
            disabled={isLoading}
            className="min-w-[200px]"
          >
            {isLoading ? (
              <>{t('common.loading', 'Loading...')}</>
            ) : (
              <>
                <CheckCircle className="mr-2 h-5 w-5" />
                {t('embeddedChat.setup.enableButton', 'Enable Embedded Chat')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <div className="mt-8 text-center text-sm text-muted-foreground">
        <p>
          {t('embeddedChat.setup.note', 'You can configure and customize your embedded chat after enabling it.')}
        </p>
      </div>
    </div>
  );
}