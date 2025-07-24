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

interface PersonasTabProps {
  chat: EmbeddedChat;
  chatUuid: string;
}

export function PersonasTab({ chat, chatUuid }: PersonasTabProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('embeddedChat.personas.title', 'Personas')}</CardTitle>
        <CardDescription>
          {t('embeddedChat.personas.description', 'Manage chat personas and routing')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">
          {t('embeddedChat.personas.comingSoon', 'Personas management coming soon...')}
        </p>
      </CardContent>
    </Card>
  );
}