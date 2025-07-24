'use client';

import { useTranslation } from 'react-i18next';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EmbeddedChat } from '@/types/embedded-chat';

interface ModelConfigTabProps {
  chat: EmbeddedChat;
  chatUuid: string;
}

export function ModelConfigTab({ chat, chatUuid }: ModelConfigTabProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('embeddedChat.model.title', 'Model Configuration')}</CardTitle>
        <CardDescription>
          {t('embeddedChat.model.description', 'Configure the AI model settings')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          {t('embeddedChat.model.comingSoon', 'Model configuration coming soon...')}
        </p>
      </CardContent>
    </Card>
  );
}