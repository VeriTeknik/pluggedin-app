import i18next, { InitOptions } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

// Import English chunks
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
import enTutorialFirstMcpServer from '../public/locales/en/tutorial-first-mcp-server.json';
import enTutorialSharingCommunity from '../public/locales/en/tutorial-sharing-with-community.json';
import enTutorialRagKnowledge from '../public/locales/en/tutorial-rag-knowledge-base.json';
import enTutorialTeamCollab from '../public/locales/en/tutorial-team-collaboration.json';
import enTutorialCustomMcp from '../public/locales/en/tutorial-custom-mcp-server.json';
import enTutorialApiIntegration from '../public/locales/en/tutorial-api-integration.json';
import enTutorialSelfHosting from '../public/locales/en/tutorial-self-hosting.json';
import enTutorialSecurity from '../public/locales/en/tutorial-security-best-practices.json';
// Import Hindi chunks
import hiApiKeys from '../public/locales/hi/apiKeys.json';
import hiAuth from '../public/locales/hi/auth.json';
import hiCommon from '../public/locales/hi/common.json';
import hiDiscover from '../public/locales/hi/discover.json';
import hiDocs from '../public/locales/hi/docs.json';
import hiGuides from '../public/locales/hi/guides.json';
import hiLibrary from '../public/locales/hi/library.json';
import hiLanding from '../public/locales/hi/landing.json';
import hiLegal from '../public/locales/hi/legal.json';
import hiMcpServers from '../public/locales/hi/mcpServers.json';
import hiNotifications from '../public/locales/hi/notifications.json';
import hiPlayground from '../public/locales/hi/playground.json';
import hiSearch from '../public/locales/hi/search.json';
import hiSettings from '../public/locales/hi/settings.json';
import hiSetupGuide from '../public/locales/hi/setupGuide.json';
import hiSidebar from '../public/locales/hi/sidebar.json';
import hiWhatsNew from '../public/locales/hi/whatsNew.json';
import hiGettingStarted from '../public/locales/hi/getting-started.json';
import hiTutorials from '../public/locales/hi/tutorials.json';
import hiTutorialFirstMcpServer from '../public/locales/hi/tutorial-first-mcp-server.json';
import hiTutorialSharingCommunity from '../public/locales/hi/tutorial-sharing-with-community.json';
import hiTutorialRagKnowledge from '../public/locales/hi/tutorial-rag-knowledge-base.json';
import hiTutorialRagClient from '../public/locales/hi/tutorial-rag-client.json';
import hiTutorialNotifications from '../public/locales/hi/tutorial-notifications.json';
import hiTutorialTeamCollab from '../public/locales/hi/tutorial-team-collaboration.json';
import hiTutorialCustomMcp from '../public/locales/hi/tutorial-custom-mcp-server.json';
import hiTutorialApiIntegration from '../public/locales/hi/tutorial-api-integration.json';
import hiTutorialSelfHosting from '../public/locales/hi/tutorial-self-hosting.json';
import hiTutorialSecurity from '../public/locales/hi/tutorial-security-best-practices.json';
// Import Japanese chunks
import jaApiKeys from '../public/locales/ja/apiKeys.json';
import jaAuth from '../public/locales/ja/auth.json';
import jaCommon from '../public/locales/ja/common.json';
import jaDiscover from '../public/locales/ja/discover.json';
import jaDocs from '../public/locales/ja/docs.json';
import jaGuides from '../public/locales/ja/guides.json';
import jaLibrary from '../public/locales/ja/library.json';
import jaLanding from '../public/locales/ja/landing.json';
import jaLegal from '../public/locales/ja/legal.json';
import jaMcpServers from '../public/locales/ja/mcpServers.json';
import jaNotifications from '../public/locales/ja/notifications.json';
import jaPlayground from '../public/locales/ja/playground.json';
import jaSearch from '../public/locales/ja/search.json';
import jaSettings from '../public/locales/ja/settings.json';
import jaSetupGuide from '../public/locales/ja/setupGuide.json';
import jaSidebar from '../public/locales/ja/sidebar.json';
import jaWhatsNew from '../public/locales/ja/whatsNew.json';
import jaGettingStarted from '../public/locales/ja/getting-started.json';
import jaTutorials from '../public/locales/ja/tutorials.json';
import jaTutorialFirstMcpServer from '../public/locales/ja/tutorial-first-mcp-server.json';
import jaTutorialSharingCommunity from '../public/locales/ja/tutorial-sharing-with-community.json';
import jaTutorialRagKnowledge from '../public/locales/ja/tutorial-rag-knowledge-base.json';
import jaTutorialRagClient from '../public/locales/ja/tutorial-rag-client.json';
import jaTutorialNotifications from '../public/locales/ja/tutorial-notifications.json';
import jaTutorialTeamCollab from '../public/locales/ja/tutorial-team-collaboration.json';
import jaTutorialCustomMcp from '../public/locales/ja/tutorial-custom-mcp-server.json';
import jaTutorialApiIntegration from '../public/locales/ja/tutorial-api-integration.json';
import jaTutorialSelfHosting from '../public/locales/ja/tutorial-self-hosting.json';
import jaTutorialSecurity from '../public/locales/ja/tutorial-security-best-practices.json';
// Import Dutch chunks
import nlApiKeys from '../public/locales/nl/apiKeys.json';
import nlAuth from '../public/locales/nl/auth.json';
import nlCommon from '../public/locales/nl/common.json';
import nlDiscover from '../public/locales/nl/discover.json';
import nlDocs from '../public/locales/nl/docs.json';
import nlGuides from '../public/locales/nl/guides.json';
import nlLibrary from '../public/locales/nl/library.json';
import nlLanding from '../public/locales/nl/landing.json';
import nlLegal from '../public/locales/nl/legal.json';
import nlMcpServers from '../public/locales/nl/mcpServers.json';
import nlNotifications from '../public/locales/nl/notifications.json';
import nlPlayground from '../public/locales/nl/playground.json';
import nlSearch from '../public/locales/nl/search.json';
import nlSettings from '../public/locales/nl/settings.json';
import nlSetupGuide from '../public/locales/nl/setupGuide.json';
import nlSidebar from '../public/locales/nl/sidebar.json';
import nlWhatsNew from '../public/locales/nl/whatsNew.json';
import nlGettingStarted from '../public/locales/nl/getting-started.json';
import nlTutorials from '../public/locales/nl/tutorials.json';
import nlTutorialFirstMcpServer from '../public/locales/nl/tutorial-first-mcp-server.json';
import nlTutorialSharingCommunity from '../public/locales/nl/tutorial-sharing-with-community.json';
import nlTutorialRagKnowledge from '../public/locales/nl/tutorial-rag-knowledge-base.json';
import nlTutorialRagClient from '../public/locales/nl/tutorial-rag-client.json';
import nlTutorialNotifications from '../public/locales/nl/tutorial-notifications.json';
import nlTutorialTeamCollab from '../public/locales/nl/tutorial-team-collaboration.json';
import nlTutorialCustomMcp from '../public/locales/nl/tutorial-custom-mcp-server.json';
import nlTutorialApiIntegration from '../public/locales/nl/tutorial-api-integration.json';
import nlTutorialSelfHosting from '../public/locales/nl/tutorial-self-hosting.json';
import nlTutorialSecurity from '../public/locales/nl/tutorial-security-best-practices.json';
// Import Turkish chunks
import trApiKeys from '../public/locales/tr/apiKeys.json';
import trAuth from '../public/locales/tr/auth.json';
import trCommon from '../public/locales/tr/common.json';
import trDiscover from '../public/locales/tr/discover.json';
import trDocs from '../public/locales/tr/docs.json';
import trGuides from '../public/locales/tr/guides.json';
import trLibrary from '../public/locales/tr/library.json';
import trLanding from '../public/locales/tr/landing.json';
import trLegal from '../public/locales/tr/legal.json';
import trMcpServers from '../public/locales/tr/mcpServers.json';
import trNotifications from '../public/locales/tr/notifications.json';
import trPlayground from '../public/locales/tr/playground.json';
import trSearch from '../public/locales/tr/search.json';
import trSettings from '../public/locales/tr/settings.json';
import trSetupGuide from '../public/locales/tr/setupGuide.json';
import trSidebar from '../public/locales/tr/sidebar.json';
import trWhatsNew from '../public/locales/tr/whatsNew.json';
import trGettingStarted from '../public/locales/tr/getting-started.json';
import trTutorials from '../public/locales/tr/tutorials.json';
import trTutorialFirstMcpServer from '../public/locales/tr/tutorial-first-mcp-server.json';
import trTutorialSharingCommunity from '../public/locales/tr/tutorial-sharing-with-community.json';
import trTutorialRagKnowledge from '../public/locales/tr/tutorial-rag-knowledge-base.json';
import trTutorialRagClient from '../public/locales/tr/tutorial-rag-client.json';
import trTutorialNotifications from '../public/locales/tr/tutorial-notifications.json';
import trTutorialTeamCollab from '../public/locales/tr/tutorial-team-collaboration.json';
import trTutorialCustomMcp from '../public/locales/tr/tutorial-custom-mcp-server.json';
import trTutorialApiIntegration from '../public/locales/tr/tutorial-api-integration.json';
import trTutorialSelfHosting from '../public/locales/tr/tutorial-self-hosting.json';
import trTutorialSecurity from '../public/locales/tr/tutorial-security-best-practices.json';
// Import Chinese chunks
import zhApiKeys from '../public/locales/zh/apiKeys.json';
import zhAuth from '../public/locales/zh/auth.json';
import zhCommon from '../public/locales/zh/common.json';
import zhDiscover from '../public/locales/zh/discover.json';
import zhDocs from '../public/locales/zh/docs.json';
import zhGuides from '../public/locales/zh/guides.json';
import zhLibrary from '../public/locales/zh/library.json';
import zhLanding from '../public/locales/zh/landing.json';
import zhLegal from '../public/locales/zh/legal.json';
import zhMcpServers from '../public/locales/zh/mcpServers.json';
import zhNotifications from '../public/locales/zh/notifications.json';
import zhPlayground from '../public/locales/zh/playground.json';
import zhSearch from '../public/locales/zh/search.json';
import zhSettings from '../public/locales/zh/settings.json';
import zhSetupGuide from '../public/locales/zh/setupGuide.json';
import zhSidebar from '../public/locales/zh/sidebar.json';
import zhWhatsNew from '../public/locales/zh/whatsNew.json';
import zhGettingStarted from '../public/locales/zh/getting-started.json';
import zhTutorials from '../public/locales/zh/tutorials.json';
import zhTutorialFirstMcpServer from '../public/locales/zh/tutorial-first-mcp-server.json';
import zhTutorialSharingCommunity from '../public/locales/zh/tutorial-sharing-with-community.json';
import zhTutorialRagKnowledge from '../public/locales/zh/tutorial-rag-knowledge-base.json';
import zhTutorialRagClient from '../public/locales/zh/tutorial-rag-client.json';
import zhTutorialNotifications from '../public/locales/zh/tutorial-notifications.json';
import zhTutorialTeamCollab from '../public/locales/zh/tutorial-team-collaboration.json';
import zhTutorialCustomMcp from '../public/locales/zh/tutorial-custom-mcp-server.json';
import zhTutorialApiIntegration from '../public/locales/zh/tutorial-api-integration.json';
import zhTutorialSelfHosting from '../public/locales/zh/tutorial-self-hosting.json';
import zhTutorialSecurity from '../public/locales/zh/tutorial-security-best-practices.json';
import { defaultLocale, locales, namespaces } from './config';

// Resources object with all translations loaded statically
const resources = {
  en: {
    translation: {
      ...enCommon,
      ...enAuth,
      ...enDiscover,
      ...enDocs,
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
    docs: enDocs,
    guides: enGuides,
    library: enLibrary,
    landing: enLanding,
    legal: enLegal,
    mcpServers: enMcpServers,
    notifications: enNotifications,
    playground: enPlayground,
    search: enSearch,
    settings: enSettings,
    setupGuide: enSetupGuide,
    sidebar: enSidebar,
    whatsNew: enWhatsNew,
    'getting-started': enGettingStarted,
    tutorials: enTutorials,
    'tutorial-rag-client': enTutorialRagClient,
    'tutorial-notifications': enTutorialNotifications,
    'tutorial-first-mcp-server': enTutorialFirstMcpServer,
    'tutorial-sharing-with-community': enTutorialSharingCommunity,
    'tutorial-rag-knowledge-base': enTutorialRagKnowledge,
    'tutorial-team-collaboration': enTutorialTeamCollab,
    'tutorial-custom-mcp-server': enTutorialCustomMcp,
    'tutorial-api-integration': enTutorialApiIntegration,
    'tutorial-self-hosting': enTutorialSelfHosting,
    'tutorial-security-best-practices': enTutorialSecurity
  },
  hi: {
    translation: {
      ...hiCommon,
      ...hiAuth,
      ...hiDiscover,
      ...hiDocs,
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
    docs: hiDocs,
    guides: hiGuides,
    library: hiLibrary,
    landing: hiLanding,
    legal: hiLegal,
    mcpServers: hiMcpServers,
    notifications: hiNotifications,
    playground: hiPlayground,
    search: hiSearch,
    settings: hiSettings,
    setupGuide: hiSetupGuide,
    sidebar: hiSidebar,
    whatsNew: hiWhatsNew,
    'getting-started': hiGettingStarted,
    tutorials: hiTutorials,
    'tutorial-first-mcp-server': hiTutorialFirstMcpServer,
    'tutorial-sharing-with-community': hiTutorialSharingCommunity,
    'tutorial-rag-knowledge-base': hiTutorialRagKnowledge,
    'tutorial-rag-client': hiTutorialRagClient,
    'tutorial-notifications': hiTutorialNotifications,
    'tutorial-team-collaboration': hiTutorialTeamCollab,
    'tutorial-custom-mcp-server': hiTutorialCustomMcp,
    'tutorial-api-integration': hiTutorialApiIntegration,
    'tutorial-self-hosting': hiTutorialSelfHosting,
    'tutorial-security-best-practices': hiTutorialSecurity
  },
  ja: {
    translation: {
      ...jaCommon,
      ...jaAuth,
      ...jaDiscover,
      ...jaDocs,
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
    docs: jaDocs,
    guides: jaGuides,
    library: jaLibrary,
    landing: jaLanding,
    legal: jaLegal,
    mcpServers: jaMcpServers,
    notifications: jaNotifications,
    playground: jaPlayground,
    search: jaSearch,
    settings: jaSettings,
    setupGuide: jaSetupGuide,
    sidebar: jaSidebar,
    whatsNew: jaWhatsNew,
    'getting-started': jaGettingStarted,
    tutorials: jaTutorials,
    'tutorial-first-mcp-server': jaTutorialFirstMcpServer,
    'tutorial-sharing-with-community': jaTutorialSharingCommunity,
    'tutorial-rag-knowledge-base': jaTutorialRagKnowledge,
    'tutorial-rag-client': jaTutorialRagClient,
    'tutorial-notifications': jaTutorialNotifications,
    'tutorial-team-collaboration': jaTutorialTeamCollab,
    'tutorial-custom-mcp-server': jaTutorialCustomMcp,
    'tutorial-api-integration': jaTutorialApiIntegration,
    'tutorial-self-hosting': jaTutorialSelfHosting,
    'tutorial-security-best-practices': jaTutorialSecurity
  },
  nl: {
    translation: {
      ...nlCommon,
      ...nlAuth,
      ...nlDiscover,
      ...nlDocs,
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
    docs: nlDocs,
    guides: nlGuides,
    library: nlLibrary,
    landing: nlLanding,
    legal: nlLegal,
    mcpServers: nlMcpServers,
    notifications: nlNotifications,
    playground: nlPlayground,
    search: nlSearch,
    settings: nlSettings,
    setupGuide: nlSetupGuide,
    sidebar: nlSidebar,
    whatsNew: nlWhatsNew,
    'getting-started': nlGettingStarted,
    tutorials: nlTutorials,
    'tutorial-first-mcp-server': nlTutorialFirstMcpServer,
    'tutorial-sharing-with-community': nlTutorialSharingCommunity,
    'tutorial-rag-knowledge-base': nlTutorialRagKnowledge,
    'tutorial-rag-client': nlTutorialRagClient,
    'tutorial-notifications': nlTutorialNotifications,
    'tutorial-team-collaboration': nlTutorialTeamCollab,
    'tutorial-custom-mcp-server': nlTutorialCustomMcp,
    'tutorial-api-integration': nlTutorialApiIntegration,
    'tutorial-self-hosting': nlTutorialSelfHosting,
    'tutorial-security-best-practices': nlTutorialSecurity
  },
  tr: {
    translation: {
      ...trCommon,
      ...trAuth,
      ...trDiscover,
      ...trDocs,
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
    docs: trDocs,
    guides: trGuides,
    library: trLibrary,
    landing: trLanding,
    legal: trLegal,
    mcpServers: trMcpServers,
    notifications: trNotifications,
    playground: trPlayground,
    search: trSearch,
    settings: trSettings,
    setupGuide: trSetupGuide,
    sidebar: trSidebar,
    whatsNew: trWhatsNew,
    'getting-started': trGettingStarted,
    tutorials: trTutorials,
    'tutorial-first-mcp-server': trTutorialFirstMcpServer,
    'tutorial-sharing-with-community': trTutorialSharingCommunity,
    'tutorial-rag-knowledge-base': trTutorialRagKnowledge,
    'tutorial-rag-client': trTutorialRagClient,
    'tutorial-notifications': trTutorialNotifications,
    'tutorial-team-collaboration': trTutorialTeamCollab,
    'tutorial-custom-mcp-server': trTutorialCustomMcp,
    'tutorial-api-integration': trTutorialApiIntegration,
    'tutorial-self-hosting': trTutorialSelfHosting,
    'tutorial-security-best-practices': trTutorialSecurity
  },
  zh: {
    translation: {
      ...zhCommon,
      ...zhAuth,
      ...zhDiscover,
      ...zhDocs,
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
    docs: zhDocs,
    guides: zhGuides,
    library: zhLibrary,
    landing: zhLanding,
    legal: zhLegal,
    mcpServers: zhMcpServers,
    notifications: zhNotifications,
    playground: zhPlayground,
    search: zhSearch,
    settings: zhSettings,
    setupGuide: zhSetupGuide,
    sidebar: zhSidebar,
    whatsNew: zhWhatsNew,
    'getting-started': zhGettingStarted,
    tutorials: zhTutorials,
    'tutorial-first-mcp-server': zhTutorialFirstMcpServer,
    'tutorial-sharing-with-community': zhTutorialSharingCommunity,
    'tutorial-rag-knowledge-base': zhTutorialRagKnowledge,
    'tutorial-rag-client': zhTutorialRagClient,
    'tutorial-notifications': zhTutorialNotifications,
    'tutorial-team-collaboration': zhTutorialTeamCollab,
    'tutorial-custom-mcp-server': zhTutorialCustomMcp,
    'tutorial-api-integration': zhTutorialApiIntegration,
    'tutorial-self-hosting': zhTutorialSelfHosting,
    'tutorial-security-best-practices': zhTutorialSecurity
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
  debug: process.env.NODE_ENV === 'development',
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
