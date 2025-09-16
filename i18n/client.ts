import i18next, { InitOptions } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

// Import English chunks
import enApiKeys from '../public/locales/en/apiKeys.json';
import enAuth from '../public/locales/en/auth.json';
import enCommon from '../public/locales/en/common.json';
import enDiscover from '../public/locales/en/discover.json';
import enDiscoverDialog from '../public/locales/en/discover_dialog.json';
import enIntelligentServer from '../public/locales/en/intelligent_server.json';
import enLibrary from '../public/locales/en/library.json';
import enLanding from '../public/locales/en/landing.json';
import enLegal from '../public/locales/en/legal.json';
import enMcpServers from '../public/locales/en/mcpServers.json';
import enNotifications from '../public/locales/en/notifications.json';
import enPlayground from '../public/locales/en/playground.json';
import enRegistry from '../public/locales/en/registry.json';
import enSearch from '../public/locales/en/search.json';
import enSettings from '../public/locales/en/settings.json';
import enSetupGuide from '../public/locales/en/setupGuide.json';
import enSidebar from '../public/locales/en/sidebar.json';
import enWhatsNew from '../public/locales/en/whatsNew.json';
// Import Hindi chunks
import hiApiKeys from '../public/locales/hi/apiKeys.json';
import hiAuth from '../public/locales/hi/auth.json';
import hiCommon from '../public/locales/hi/common.json';
import hiDiscover from '../public/locales/hi/discover.json';
import hiDiscoverDialog from '../public/locales/hi/discover_dialog.json';
import hiIntelligentServer from '../public/locales/hi/intelligent_server.json';
import hiLibrary from '../public/locales/hi/library.json';
import hiLanding from '../public/locales/hi/landing.json';
import hiLegal from '../public/locales/hi/legal.json';
import hiMcpServers from '../public/locales/hi/mcpServers.json';
import hiNotifications from '../public/locales/hi/notifications.json';
import hiPlayground from '../public/locales/hi/playground.json';
import hiRegistry from '../public/locales/hi/registry.json';
import hiSearch from '../public/locales/hi/search.json';
import hiSettings from '../public/locales/hi/settings.json';
import hiSetupGuide from '../public/locales/hi/setupGuide.json';
import hiSidebar from '../public/locales/hi/sidebar.json';
import hiWhatsNew from '../public/locales/hi/whatsNew.json';
// Import Japanese chunks
import jaApiKeys from '../public/locales/ja/apiKeys.json';
import jaAuth from '../public/locales/ja/auth.json';
import jaCommon from '../public/locales/ja/common.json';
import jaDiscover from '../public/locales/ja/discover.json';
import jaDiscoverDialog from '../public/locales/ja/discover_dialog.json';
import jaIntelligentServer from '../public/locales/ja/intelligent_server.json';
import jaLibrary from '../public/locales/ja/library.json';
import jaLanding from '../public/locales/ja/landing.json';
import jaLegal from '../public/locales/ja/legal.json';
import jaMcpServers from '../public/locales/ja/mcpServers.json';
import jaNotifications from '../public/locales/ja/notifications.json';
import jaPlayground from '../public/locales/ja/playground.json';
import jaRegistry from '../public/locales/ja/registry.json';
import jaSearch from '../public/locales/ja/search.json';
import jaSettings from '../public/locales/ja/settings.json';
import jaSetupGuide from '../public/locales/ja/setupGuide.json';
import jaSidebar from '../public/locales/ja/sidebar.json';
import jaWhatsNew from '../public/locales/ja/whatsNew.json';
// Import Dutch chunks
import nlApiKeys from '../public/locales/nl/apiKeys.json';
import nlAuth from '../public/locales/nl/auth.json';
import nlCommon from '../public/locales/nl/common.json';
import nlDiscover from '../public/locales/nl/discover.json';
import nlDiscoverDialog from '../public/locales/nl/discover_dialog.json';
import nlIntelligentServer from '../public/locales/nl/intelligent_server.json';
import nlLibrary from '../public/locales/nl/library.json';
import nlLanding from '../public/locales/nl/landing.json';
import nlLegal from '../public/locales/nl/legal.json';
import nlMcpServers from '../public/locales/nl/mcpServers.json';
import nlNotifications from '../public/locales/nl/notifications.json';
import nlPlayground from '../public/locales/nl/playground.json';
import nlRegistry from '../public/locales/nl/registry.json';
import nlSearch from '../public/locales/nl/search.json';
import nlSettings from '../public/locales/nl/settings.json';
import nlSetupGuide from '../public/locales/nl/setupGuide.json';
import nlSidebar from '../public/locales/nl/sidebar.json';
import nlWhatsNew from '../public/locales/nl/whatsNew.json';
// Import Turkish chunks
import trApiKeys from '../public/locales/tr/apiKeys.json';
import trAuth from '../public/locales/tr/auth.json';
import trCommon from '../public/locales/tr/common.json';
import trDiscover from '../public/locales/tr/discover.json';
import trDiscoverDialog from '../public/locales/tr/discover_dialog.json';
import trIntelligentServer from '../public/locales/tr/intelligent_server.json';
import trLibrary from '../public/locales/tr/library.json';
import trLanding from '../public/locales/tr/landing.json';
import trLegal from '../public/locales/tr/legal.json';
import trMcpServers from '../public/locales/tr/mcpServers.json';
import trNotifications from '../public/locales/tr/notifications.json';
import trPlayground from '../public/locales/tr/playground.json';
import trRegistry from '../public/locales/tr/registry.json';
import trSearch from '../public/locales/tr/search.json';
import trSettings from '../public/locales/tr/settings.json';
import trSetupGuide from '../public/locales/tr/setupGuide.json';
import trSidebar from '../public/locales/tr/sidebar.json';
import trWhatsNew from '../public/locales/tr/whatsNew.json';
// Import Chinese chunks
import zhApiKeys from '../public/locales/zh/apiKeys.json';
import zhAuth from '../public/locales/zh/auth.json';
import zhCommon from '../public/locales/zh/common.json';
import zhDiscover from '../public/locales/zh/discover.json';
import zhDiscoverDialog from '../public/locales/zh/discover_dialog.json';
import zhIntelligentServer from '../public/locales/zh/intelligent_server.json';
import zhLibrary from '../public/locales/zh/library.json';
import zhLanding from '../public/locales/zh/landing.json';
import zhLegal from '../public/locales/zh/legal.json';
import zhMcpServers from '../public/locales/zh/mcpServers.json';
import zhNotifications from '../public/locales/zh/notifications.json';
import zhPlayground from '../public/locales/zh/playground.json';
import zhRegistry from '../public/locales/zh/registry.json';
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
    apiKeys: enApiKeys,
    auth: enAuth,
    common: enCommon,
    discover: enDiscover,
    discover_dialog: enDiscoverDialog,
    intelligent_server: enIntelligentServer,
    library: enLibrary,
    landing: enLanding,
    legal: enLegal,
    mcpServers: enMcpServers,
    notifications: enNotifications,
    playground: enPlayground,
    registry: enRegistry,
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
    apiKeys: hiApiKeys,
    auth: hiAuth,
    common: hiCommon,
    discover: hiDiscover,
    discover_dialog: hiDiscoverDialog,
    intelligent_server: hiIntelligentServer,
    library: hiLibrary,
    landing: hiLanding,
    legal: hiLegal,
    mcpServers: hiMcpServers,
    notifications: hiNotifications,
    playground: hiPlayground,
    registry: hiRegistry,
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
    apiKeys: jaApiKeys,
    auth: jaAuth,
    common: jaCommon,
    discover: jaDiscover,
    discover_dialog: jaDiscoverDialog,
    intelligent_server: jaIntelligentServer,
    library: jaLibrary,
    landing: jaLanding,
    legal: jaLegal,
    mcpServers: jaMcpServers,
    notifications: jaNotifications,
    playground: jaPlayground,
    registry: jaRegistry,
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
    apiKeys: nlApiKeys,
    auth: nlAuth,
    common: nlCommon,
    discover: nlDiscover,
    discover_dialog: nlDiscoverDialog,
    intelligent_server: nlIntelligentServer,
    library: nlLibrary,
    landing: nlLanding,
    legal: nlLegal,
    mcpServers: nlMcpServers,
    notifications: nlNotifications,
    playground: nlPlayground,
    registry: nlRegistry,
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
    apiKeys: trApiKeys,
    auth: trAuth,
    common: trCommon,
    discover: trDiscover,
    discover_dialog: trDiscoverDialog,
    intelligent_server: trIntelligentServer,
    library: trLibrary,
    landing: trLanding,
    legal: trLegal,
    mcpServers: trMcpServers,
    notifications: trNotifications,
    playground: trPlayground,
    registry: trRegistry,
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
    apiKeys: zhApiKeys,
    auth: zhAuth,
    common: zhCommon,
    discover: zhDiscover,
    discover_dialog: zhDiscoverDialog,
    intelligent_server: zhIntelligentServer,
    library: zhLibrary,
    landing: zhLanding,
    legal: zhLegal,
    mcpServers: zhMcpServers,
    notifications: zhNotifications,
    playground: zhPlayground,
    registry: zhRegistry,
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
