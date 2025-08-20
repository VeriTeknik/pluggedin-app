'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmbeddedChat } from '@/types/embedded-chat';

import { ApiKeysTab } from './api-keys-tab';
import { AppearanceTab } from './appearance-tab';
import { CapabilitiesTab } from './capabilities-tab';
import { DangerZoneTab } from './danger-zone-tab';
import { DiscoveryProfileTab } from './discovery-profile-tab';
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
      <TabsList className="grid w-full grid-cols-9">
        <TabsTrigger value="general">
          {t('embeddedChat.tabs.general', 'General')}
        </TabsTrigger>
        <TabsTrigger value="discovery">
          {t('embeddedChat.tabs.discovery', 'Discovery')}
        </TabsTrigger>
        <TabsTrigger value="model">
          {t('embeddedChat.tabs.model', 'Model')}
        </TabsTrigger>
        <TabsTrigger value="personas">
          {t('embeddedChat.tabs.personas', 'Personas')}
        </TabsTrigger>
        <TabsTrigger value="capabilities">
          {t('embeddedChat.tabs.capabilities', 'Capabilities')}
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
        <TabsTrigger value="danger-zone" className="text-destructive">
          {t('embeddedChat.tabs.dangerZone', 'Danger Zone')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="space-y-4">
        <GeneralSettingsTab chat={chat} chatUuid={chatUuid} />
      </TabsContent>

      <TabsContent value="discovery" className="space-y-4">
        <DiscoveryProfileTab chat={chat} chatUuid={chatUuid} />
      </TabsContent>

      <TabsContent value="model" className="space-y-4">
        <ModelConfigTab chat={chat} chatUuid={chatUuid} />
      </TabsContent>

      <TabsContent value="personas" className="space-y-4">
        <PersonasTab chat={chat} chatUuid={chatUuid} />
      </TabsContent>

      <TabsContent value="capabilities" className="space-y-4">
        <CapabilitiesTab chat={chat} chatUuid={chatUuid} />
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


      <TabsContent value="danger-zone" className="space-y-4">
        <DangerZoneTab chat={chat} chatUuid={chatUuid} />
      </TabsContent>
    </Tabs>
  );
}