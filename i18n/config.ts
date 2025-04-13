export const defaultLocale = 'en';

export const locales = ['en', 'tr', 'nl', 'zh', 'ja', 'hi'] as const;
export type Locale = typeof locales[number];

export const localeNames = {
  en: 'English',
  tr: 'Türkçe',
  nl: 'Nederlands',
  zh: '中文 (简体)', // Simplified Chinese
  ja: '日本語', // Japanese
  hi: 'हिन्दी' // Hindi
} as const;

export const isRTL = (locale: string): boolean => {
  const rtlLocales = ['ar', 'fa', 'he'];
  return rtlLocales.includes(locale);
};

// Import chunk types
import enApiKeys from './locales/en/apiKeys.json';
import enAuth from './locales/en/auth.json';
import enCommon from './locales/en/common.json';
import enLanding from './locales/en/landing.json';
import enLegal from './locales/en/legal.json';
import enMcpServers from './locales/en/mcpServers.json';
import enNotifications from './locales/en/notifications.json';
import enPlayground from './locales/en/playground.json';
import enSearch from './locales/en/search.json';
import enSettings from './locales/en/settings.json';
import enSetupGuide from './locales/en/setupGuide.json';
import enSidebar from './locales/en/sidebar.json';

export type Messages = typeof enCommon &
  typeof enAuth &
  typeof enLanding &
  typeof enMcpServers &
  typeof enSearch &
  typeof enApiKeys &
  typeof enLegal &
  typeof enSidebar &
  typeof enSettings &
  typeof enSetupGuide &
  typeof enPlayground &
  typeof enNotifications;

export type MessageKey = keyof Messages;
