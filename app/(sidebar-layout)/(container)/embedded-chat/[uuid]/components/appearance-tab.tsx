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

interface AppearanceTabProps {
  chat: EmbeddedChat;
  chatUuid: string;
}

export function AppearanceTab({ chat, chatUuid }: AppearanceTabProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('embeddedChat.appearance.title', 'Appearance')}</CardTitle>
        <CardDescription>
          {t('embeddedChat.appearance.description', 'Customize the chat widget appearance')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          {t('embeddedChat.appearance.comingSoon', 'Appearance customization coming soon...')}
        </p>
      </CardContent>
    </Card>
  );
}