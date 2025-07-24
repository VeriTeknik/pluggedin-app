'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmbeddedChat } from '@/types/embedded-chat';

import { ApiKeysTab } from './api-keys-tab';
import { AppearanceTab } from './appearance-tab';
import { EmbedCodeTab } from './embed-code-tab';
import { GeneralSettingsTab } from './general-settings-tab';
import { ModelConfigTab } from './model-config-tab';
import { PersonasTab } from './personas-tab';

interface ChatConfigurationTabsProps {
  chat: EmbeddedChat;
  chatUuid: string;
}

export function ChatConfigurationTabs({ chat, chatUuid }: ChatConfigurationTabsProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('general');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className="grid w-full grid-cols-6">
        <TabsTrigger value="general">
          {t('embeddedChat.tabs.general', 'General')}
        </TabsTrigger>
        <TabsTrigger value="model">
          {t('embeddedChat.tabs.model', 'Model')}
        </TabsTrigger>
        <TabsTrigger value="personas">
          {t('embeddedChat.tabs.personas', 'Personas')}
        </TabsTrigger>
        <TabsTrigger value="appearance">
          {t('embeddedChat.tabs.appearance', 'Appearance')}
        </TabsTrigger>
        <TabsTrigger value="api-keys">
          {t('embeddedChat.tabs.apiKeys', 'API Keys')}
        </TabsTrigger>
        <TabsTrigger value="embed">
          {t('embeddedChat.tabs.embed', 'Embed')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="space-y-4">
        <GeneralSettingsTab chat={chat} chatUuid={chatUuid} />
      </TabsContent>

      <TabsContent value="model" className="space-y-4">
        <ModelConfigTab chat={chat} chatUuid={chatUuid} />
      </TabsContent>

      <TabsContent value="personas" className="space-y-4">
        <PersonasTab chat={chat} chatUuid={chatUuid} />
      </TabsContent>

      <TabsContent value="appearance" className="space-y-4">
        <AppearanceTab chat={chat} chatUuid={chatUuid} />
      </TabsContent>

      <TabsContent value="api-keys" className="space-y-4">
        <ApiKeysTab chat={chat} chatUuid={chatUuid} />
      </TabsContent>

      <TabsContent value="embed" className="space-y-4">
        <EmbedCodeTab chat={chat} chatUuid={chatUuid} />
      </TabsContent>
    </Tabs>
  );
}