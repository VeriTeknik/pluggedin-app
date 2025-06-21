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
import enApiKeys from '../public/locales/en/apiKeys.json';
import enAuth from '../public/locales/en/auth.json';
import enCommon from '../public/locales/en/common.json';
import enDiscover from '../public/locales/en/discover.json';
import enDocs from '../public/locales/en/docs.json';
import enGuides from '../public/locales/en/guides.json';
import enLibrary from '../public/locales/en/library.json';
import enLanding from '../public/locales/en/landing.json';
import enLegal from '../public/locales/en/legal.json';
import enMcpServers from '../public/locales/en/mcpServers.json';
import enNotifications from '../public/locales/en/notifications.json';
import enPlayground from '../public/locales/en/playground.json';
import enSearch from '../public/locales/en/search.json';
import enSettings from '../public/locales/en/settings.json';
import enSetupGuide from '../public/locales/en/setupGuide.json';
import enSidebar from '../public/locales/en/sidebar.json';
import enWhatsNew from '../public/locales/en/whatsNew.json';
import enGettingStarted from '../public/locales/en/getting-started.json';
import enTutorials from '../public/locales/en/tutorials.json';
import enTutorialRagClient from '../public/locales/en/tutorial-rag-client.json';
import enTutorialNotifications from '../public/locales/en/tutorial-notifications.json';

// Define namespaces
export const namespaces = [
  'apiKeys',
  'auth',
  'common',
  'discover',
  'docs',
  'guides',
  'landing',
  'legal',
  'library',
  'mcpServers',
  'notifications',
  'playground',
  'search',
  'settings',
  'setupGuide',
  'sidebar',
  'whatsNew',
  'getting-started',
  'tutorials',
  'tutorial-rag-client',
  'tutorial-notifications'
] as const;

export type Namespace = typeof namespaces[number];

// Define messages type for each namespace
export type Messages = {
  apiKeys: typeof enApiKeys;
  auth: typeof enAuth;
  common: typeof enCommon;
  discover: typeof enDiscover;
  docs: typeof enDocs;
  guides: typeof enGuides;
  landing: typeof enLanding;
  legal: typeof enLegal;
  library: typeof enLibrary;
  mcpServers: typeof enMcpServers;
  notifications: typeof enNotifications;
  playground: typeof enPlayground;
  search: typeof enSearch;
  settings: typeof enSettings;
  setupGuide: typeof enSetupGuide;
  sidebar: typeof enSidebar;
  whatsNew: typeof enWhatsNew;
  'getting-started': typeof enGettingStarted;
  tutorials: typeof enTutorials;
  'tutorial-rag-client': typeof enTutorialRagClient;
  'tutorial-notifications': typeof enTutorialNotifications;
};

export type MessageKey<NS extends Namespace> = keyof Messages[NS];
