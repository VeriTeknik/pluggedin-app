'use client';

import { ModernEmbeddedChat } from '@/components/embedded-chat/modern-embedded-chat';
import type { EmbeddedChat, Project } from '@/types/embedded-chat';

interface CleanEmbeddedWrapperProps {
  chat: EmbeddedChat;
  project: Project;
}

export function CleanEmbeddedWrapper({ chat, project }: CleanEmbeddedWrapperProps) {
  // Parse theme from theme_config with fallbacks
  const themeConfig = chat.theme_config && typeof chat.theme_config === 'object' ? chat.theme_config : {};
  
  return (
    <div className="h-screen w-full bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="h-full max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
        <div className="h-full bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden">
          <ModernEmbeddedChat
            chatUuid={chat.uuid}
            chatConfig={chat}
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
}