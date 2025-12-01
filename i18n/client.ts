import i18next, { InitOptions } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

// Import English chunks
import enAnalytics from '../public/locales/en/analytics.json';
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
// Import Hindi chunks
import hiAnalytics from '../public/locales/hi/analytics.json';
import hiApiKeys from '../public/locales/hi/apiKeys.json';
import hiAuth from '../public/locales/hi/auth.json';
import hiBlog from '../public/locales/hi/blog.json';
import hiCollections from '../public/locales/hi/collections.json';
import hiCommon from '../public/locales/hi/common.json';
import hiDiscover from '../public/locales/hi/discover.json';
import hiDiscoverDialog from '../public/locales/hi/discover_dialog.json';
import hiInstall from '../public/locales/hi/install.json';
import hiIntelligentServer from '../public/locales/hi/intelligent_server.json';
import hiLibrary from '../public/locales/hi/library.json';
import hiLanding from '../public/locales/hi/landing.json';
import hiLegal from '../public/locales/hi/legal.json';
import hiMcpServers from '../public/locales/hi/mcpServers.json';
import hiMemory from '../public/locales/hi/memory.json';
import hiNotifications from '../public/locales/hi/notifications.json';
import hiPlayground from '../public/locales/hi/playground.json';
import hiRegistry from '../public/locales/hi/registry.json';
import hiRoadmap from '../public/locales/hi/roadmap.json';
import hiSearch from '../public/locales/hi/search.json';
import hiSettings from '../public/locales/hi/settings.json';
import hiSetupGuide from '../public/locales/hi/setupGuide.json';
import hiSidebar from '../public/locales/hi/sidebar.json';
import hiWhatsNew from '../public/locales/hi/whatsNew.json';
// Import Japanese chunks
import jaAnalytics from '../public/locales/ja/analytics.json';
import jaApiKeys from '../public/locales/ja/apiKeys.json';
import jaAuth from '../public/locales/ja/auth.json';
import jaBlog from '../public/locales/ja/blog.json';
import jaCollections from '../public/locales/ja/collections.json';
import jaCommon from '../public/locales/ja/common.json';
import jaDiscover from '../public/locales/ja/discover.json';
import jaDiscoverDialog from '../public/locales/ja/discover_dialog.json';
import jaInstall from '../public/locales/ja/install.json';
import jaIntelligentServer from '../public/locales/ja/intelligent_server.json';
import jaLibrary from '../public/locales/ja/library.json';
import jaLanding from '../public/locales/ja/landing.json';
import jaLegal from '../public/locales/ja/legal.json';
import jaMcpServers from '../public/locales/ja/mcpServers.json';
import jaMemory from '../public/locales/ja/memory.json';
import jaNotifications from '../public/locales/ja/notifications.json';
import jaPlayground from '../public/locales/ja/playground.json';
import jaRegistry from '../public/locales/ja/registry.json';
import jaRoadmap from '../public/locales/ja/roadmap.json';
import jaSearch from '../public/locales/ja/search.json';
import jaSettings from '../public/locales/ja/settings.json';
import jaSetupGuide from '../public/locales/ja/setupGuide.json';
import jaSidebar from '../public/locales/ja/sidebar.json';
import jaWhatsNew from '../public/locales/ja/whatsNew.json';
// Import Dutch chunks
import nlAnalytics from '../public/locales/nl/analytics.json';
import nlApiKeys from '../public/locales/nl/apiKeys.json';
import nlAuth from '../public/locales/nl/auth.json';
import nlBlog from '../public/locales/nl/blog.json';
import nlCollections from '../public/locales/nl/collections.json';
import nlCommon from '../public/locales/nl/common.json';
import nlDiscover from '../public/locales/nl/discover.json';
import nlDiscoverDialog from '../public/locales/nl/discover_dialog.json';
import nlInstall from '../public/locales/nl/install.json';
import nlIntelligentServer from '../public/locales/nl/intelligent_server.json';
import nlLibrary from '../public/locales/nl/library.json';
import nlLanding from '../public/locales/nl/landing.json';
import nlLegal from '../public/locales/nl/legal.json';
import nlMcpServers from '../public/locales/nl/mcpServers.json';
import nlMemory from '../public/locales/nl/memory.json';
import nlNotifications from '../public/locales/nl/notifications.json';
import nlPlayground from '../public/locales/nl/playground.json';
import nlRegistry from '../public/locales/nl/registry.json';
import nlRoadmap from '../public/locales/nl/roadmap.json';
import nlSearch from '../public/locales/nl/search.json';
import nlSettings from '../public/locales/nl/settings.json';
import nlSetupGuide from '../public/locales/nl/setupGuide.json';
import nlSidebar from '../public/locales/nl/sidebar.json';
import nlWhatsNew from '../public/locales/nl/whatsNew.json';
// Import Turkish chunks
import trAnalytics from '../public/locales/tr/analytics.json';
import trApiKeys from '../public/locales/tr/apiKeys.json';
import trAuth from '../public/locales/tr/auth.json';
import trBlog from '../public/locales/tr/blog.json';
import trCollections from '../public/locales/tr/collections.json';
import trCommon from '../public/locales/tr/common.json';
import trDiscover from '../public/locales/tr/discover.json';
import trDiscoverDialog from '../public/locales/tr/discover_dialog.json';
import trInstall from '../public/locales/tr/install.json';
import trIntelligentServer from '../public/locales/tr/intelligent_server.json';
import trLibrary from '../public/locales/tr/library.json';
import trLanding from '../public/locales/tr/landing.json';
import trLegal from '../public/locales/tr/legal.json';
import trMcpServers from '../public/locales/tr/mcpServers.json';
import trMemory from '../public/locales/tr/memory.json';
import trNotifications from '../public/locales/tr/notifications.json';
import trPlayground from '../public/locales/tr/playground.json';
import trRegistry from '../public/locales/tr/registry.json';
import trRoadmap from '../public/locales/tr/roadmap.json';
import trSearch from '../public/locales/tr/search.json';
import trSettings from '../public/locales/tr/settings.json';
import trSetupGuide from '../public/locales/tr/setupGuide.json';
import trSidebar from '../public/locales/tr/sidebar.json';
import trWhatsNew from '../public/locales/tr/whatsNew.json';
// Import Chinese chunks
import zhAnalytics from '../public/locales/zh/analytics.json';
import zhApiKeys from '../public/locales/zh/apiKeys.json';
import zhAuth from '../public/locales/zh/auth.json';
import zhBlog from '../public/locales/zh/blog.json';
import zhCollections from '../public/locales/zh/collections.json';
import zhCommon from '../public/locales/zh/common.json';
import zhDiscover from '../public/locales/zh/discover.json';
import zhDiscoverDialog from '../public/locales/zh/discover_dialog.json';
import zhInstall from '../public/locales/zh/install.json';
import zhIntelligentServer from '../public/locales/zh/intelligent_server.json';
import zhLibrary from '../public/locales/zh/library.json';
import zhLanding from '../public/locales/zh/landing.json';
import zhLegal from '../public/locales/zh/legal.json';
import zhMcpServers from '../public/locales/zh/mcpServers.json';
import zhMemory from '../public/locales/zh/memory.json';
import zhNotifications from '../public/locales/zh/notifications.json';
import zhPlayground from '../public/locales/zh/playground.json';
import zhRegistry from '../public/locales/zh/registry.json';
import zhRoadmap from '../public/locales/zh/roadmap.json';
import zhSearch from '../public/locales/zh/search.json';
import zhSettings from '../public/locales/zh/settings.json';
import zhSetupGuide from '../public/locales/zh/setupGuide.json';
import zhSidebar from '../public/locales/zh/sidebar.json';
import zhWhatsNew from '../public/locales/zh/whatsNew.json';
import { defaultLocale, locales, namespaces } from './config';

// Resources object with all translations loaded statically
const resources = {
  en: {
    translation: {
      ...enCommon,
      ...enAuth,
      ...enDiscover,
      ...enLibrary,
      ...enLanding,
      ...enMcpServers,
      ...enSearch,
      ...enApiKeys,
      ...enLegal,
      ...enSidebar,
      ...enSettings,
      ...enSetupGuide,
      ...enPlayground,
      ...enNotifications,
      ...enWhatsNew
    },
    analytics: enAnalytics,
    apiKeys: enApiKeys,
    auth: enAuth,
    blog: enBlog,
    collections: enCollections,
    common: enCommon,
    discover: enDiscover,
    discover_dialog: enDiscoverDialog,
    install: enInstall,
    intelligent_server: enIntelligentServer,
    library: enLibrary,
    landing: enLanding,
    legal: enLegal,
    mcpServers: enMcpServers,
    memory: enMemory,
    notifications: enNotifications,
    playground: enPlayground,
    registry: enRegistry,
    roadmap: enRoadmap,
    search: enSearch,
    settings: enSettings,
    setupGuide: enSetupGuide,
    sidebar: enSidebar,
    whatsNew: enWhatsNew,
  },
  hi: {
    translation: {
      ...hiCommon,
      ...hiAuth,
      ...hiDiscover,
      ...hiLibrary,
      ...hiLanding,
      ...hiMcpServers,
      ...hiSearch,
      ...hiApiKeys,
      ...hiLegal,
      ...hiSidebar,
      ...hiSettings,
      ...hiSetupGuide,
      ...hiPlayground,
      ...hiNotifications,
      ...hiWhatsNew
    },
    analytics: hiAnalytics,
    apiKeys: hiApiKeys,
    auth: hiAuth,
    blog: hiBlog,
    collections: hiCollections,
    common: hiCommon,
    discover: hiDiscover,
    discover_dialog: hiDiscoverDialog,
    install: hiInstall,
    intelligent_server: hiIntelligentServer,
    library: hiLibrary,
    landing: hiLanding,
    legal: hiLegal,
    mcpServers: hiMcpServers,
    memory: hiMemory,
    notifications: hiNotifications,
    playground: hiPlayground,
    registry: hiRegistry,
    roadmap: hiRoadmap,
    search: hiSearch,
    settings: hiSettings,
    setupGuide: hiSetupGuide,
    sidebar: hiSidebar,
    whatsNew: hiWhatsNew,
  },
  ja: {
    translation: {
      ...jaCommon,
      ...jaAuth,
      ...jaDiscover,
      ...jaLibrary,
      ...jaLanding,
      ...jaMcpServers,
      ...jaSearch,
      ...jaApiKeys,
      ...jaLegal,
      ...jaSidebar,
      ...jaSettings,
      ...jaSetupGuide,
      ...jaPlayground,
      ...jaNotifications,
      ...jaWhatsNew
    },
    analytics: jaAnalytics,
    apiKeys: jaApiKeys,
    auth: jaAuth,
    blog: jaBlog,
    collections: jaCollections,
    common: jaCommon,
    discover: jaDiscover,
    discover_dialog: jaDiscoverDialog,
    install: jaInstall,
    intelligent_server: jaIntelligentServer,
    library: jaLibrary,
    landing: jaLanding,
    legal: jaLegal,
    mcpServers: jaMcpServers,
    memory: jaMemory,
    notifications: jaNotifications,
    playground: jaPlayground,
    registry: jaRegistry,
    roadmap: jaRoadmap,
    search: jaSearch,
    settings: jaSettings,
    setupGuide: jaSetupGuide,
    sidebar: jaSidebar,
    whatsNew: jaWhatsNew,
  },
  nl: {
    translation: {
      ...nlCommon,
      ...nlAuth,
      ...nlDiscover,
      ...nlLibrary,
      ...nlLanding,
      ...nlMcpServers,
      ...nlSearch,
      ...nlApiKeys,
      ...nlLegal,
      ...nlSidebar,
      ...nlSettings,
      ...nlSetupGuide,
      ...nlPlayground,
      ...nlNotifications,
      ...nlWhatsNew
    },
    analytics: nlAnalytics,
    apiKeys: nlApiKeys,
    auth: nlAuth,
    blog: nlBlog,
    collections: nlCollections,
    common: nlCommon,
    discover: nlDiscover,
    discover_dialog: nlDiscoverDialog,
    install: nlInstall,
    intelligent_server: nlIntelligentServer,
    library: nlLibrary,
    landing: nlLanding,
    legal: nlLegal,
    mcpServers: nlMcpServers,
    memory: nlMemory,
    notifications: nlNotifications,
    playground: nlPlayground,
    registry: nlRegistry,
    roadmap: nlRoadmap,
    search: nlSearch,
    settings: nlSettings,
    setupGuide: nlSetupGuide,
    sidebar: nlSidebar,
    whatsNew: nlWhatsNew,
  },
  tr: {
    translation: {
      ...trCommon,
      ...trAuth,
      ...trDiscover,
      ...trLibrary,
      ...trLanding,
      ...trMcpServers,
      ...trSearch,
      ...trApiKeys,
      ...trLegal,
      ...trSidebar,
      ...trSettings,
      ...trSetupGuide,
      ...trPlayground,
      ...trNotifications,
      ...trWhatsNew
    },
    analytics: trAnalytics,
    apiKeys: trApiKeys,
    auth: trAuth,
    blog: trBlog,
    collections: trCollections,
    common: trCommon,
    discover: trDiscover,
    discover_dialog: trDiscoverDialog,
    install: trInstall,
    intelligent_server: trIntelligentServer,
    library: trLibrary,
    landing: trLanding,
    legal: trLegal,
    mcpServers: trMcpServers,
    memory: trMemory,
    notifications: trNotifications,
    playground: trPlayground,
    registry: trRegistry,
    roadmap: trRoadmap,
    search: trSearch,
    settings: trSettings,
    setupGuide: trSetupGuide,
    sidebar: trSidebar,
    whatsNew: trWhatsNew,
  },
  zh: {
    translation: {
      ...zhCommon,
      ...zhAuth,
      ...zhDiscover,
      ...zhLibrary,
      ...zhLanding,
      ...zhMcpServers,
      ...zhSearch,
      ...zhApiKeys,
      ...zhLegal,
      ...zhSidebar,
      ...zhSettings,
      ...zhSetupGuide,
      ...zhPlayground,
      ...zhNotifications,
      ...zhWhatsNew
    },
    analytics: zhAnalytics,
    apiKeys: zhApiKeys,
    auth: zhAuth,
    blog: zhBlog,
    collections: zhCollections,
    common: zhCommon,
    discover: zhDiscover,
    discover_dialog: zhDiscoverDialog,
    install: zhInstall,
    intelligent_server: zhIntelligentServer,
    library: zhLibrary,
    landing: zhLanding,
    legal: zhLegal,
    mcpServers: zhMcpServers,
    memory: zhMemory,
    notifications: zhNotifications,
    playground: zhPlayground,
    registry: zhRegistry,
    roadmap: zhRoadmap,
    search: zhSearch,
    settings: zhSettings,
    setupGuide: zhSetupGuide,
    sidebar: zhSidebar,
    whatsNew: zhWhatsNew,
  }
};

// Language detection options
const detectionOptions = {
  order: ['localStorage', 'navigator'],
  lookupLocalStorage: 'pluggedin_language',
  caches: ['localStorage']
};

const i18nConfig: InitOptions = {
  resources,
  fallbackLng: defaultLocale,
  supportedLngs: locales,
  ns: ['translation', ...namespaces],
  defaultNS: 'translation',
  load: 'languageOnly',
  debug: false,
  detection: detectionOptions,
  interpolation: {
    escapeValue: false
  },
  react: {
    useSuspense: false
  }
};

i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init(i18nConfig);

export default i18next;
