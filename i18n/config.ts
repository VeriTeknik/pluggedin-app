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
import enAgents from '../public/locales/en/agents.json';
import enApiKeys from '../public/locales/en/apiKeys.json';
import enAuth from '../public/locales/en/auth.json';
import enBlog from '../public/locales/en/blog.json';
import enCollections from '../public/locales/en/collections.json';
import enCommon from '../public/locales/en/common.json';
import enDiscover from '../public/locales/en/discover.json';
import enDiscoverDialog from '../public/locales/en/discover_dialog.json';
import enInstall from '../public/locales/en/install.json';
import enIntelligentServer from '../public/locales/en/intelligent_server.json';
import enLibrary from '../public/locales/en/library.json';
import enLanding from '../public/locales/en/landing.json';
import enLegal from '../public/locales/en/legal.json';
import enMcpServers from '../public/locales/en/mcpServers.json';
import enMemory from '../public/locales/en/memory.json';
import enNotifications from '../public/locales/en/notifications.json';
import enPlayground from '../public/locales/en/playground.json';
import enRegistry from '../public/locales/en/registry.json';
import enRoadmap from '../public/locales/en/roadmap.json';
import enSearch from '../public/locales/en/search.json';
import enSettings from '../public/locales/en/settings.json';
import enSetupGuide from '../public/locales/en/setupGuide.json';
import enSidebar from '../public/locales/en/sidebar.json';
import enWhatsNew from '../public/locales/en/whatsNew.json';

// Define namespaces
export const namespaces = [
  'agents',
  'apiKeys',
  'auth',
  'blog',
  'collections',
  'common',
  'discover',
  'discover_dialog',
  'install',
  'intelligent_server',
  'landing',
  'legal',
  'library',
  'mcpServers',
  'memory',
  'notifications',
  'playground',
  'registry',
  'roadmap',
  'search',
  'settings',
  'setupGuide',
  'sidebar',
  'whatsNew',
] as const;

// Type definitions for internal use (not exported to avoid knip warnings)
type Namespace = typeof namespaces[number];

// Define messages type for each namespace
type Messages = {
  agents: typeof enAgents;
  apiKeys: typeof enApiKeys;
  auth: typeof enAuth;
  blog: typeof enBlog;
  collections: typeof enCollections;
  common: typeof enCommon;
  discover: typeof enDiscover;
  discover_dialog: typeof enDiscoverDialog;
  install: typeof enInstall;
  intelligent_server: typeof enIntelligentServer;
  landing: typeof enLanding;
  legal: typeof enLegal;
  library: typeof enLibrary;
  mcpServers: typeof enMcpServers;
  memory: typeof enMemory;
  notifications: typeof enNotifications;
  playground: typeof enPlayground;
  registry: typeof enRegistry;
  roadmap: typeof enRoadmap;
  search: typeof enSearch;
  settings: typeof enSettings;
  setupGuide: typeof enSetupGuide;
  sidebar: typeof enSidebar;
  whatsNew: typeof enWhatsNew;
};

type MessageKey<NS extends Namespace> = keyof Messages[NS];
