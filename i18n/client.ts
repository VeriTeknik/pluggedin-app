import i18next, { InitOptions } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

// Import English chunks
import enApiKeys from '../public/locales/en/apiKeys.json';
import enAuth from '../public/locales/en/auth.json';
import enCommon from '../public/locales/en/common.json';
import enDiscover from '../public/locales/en/discover.json';
import enLanding from '../public/locales/en/landing.json';
import enLegal from '../public/locales/en/legal.json';
import enMcpServers from '../public/locales/en/mcpServers.json';
import enNotifications from '../public/locales/en/notifications.json';
import enPlayground from '../public/locales/en/playground.json';
import enSearch from '../public/locales/en/search.json';
import enSettings from '../public/locales/en/settings.json';
import enSetupGuide from '../public/locales/en/setupGuide.json';
import enSidebar from '../public/locales/en/sidebar.json';
// Import Turkish chunks
import trApiKeys from '../public/locales/tr/apiKeys.json';
import trAuth from '../public/locales/tr/auth.json';
import trCommon from '../public/locales/tr/common.json';
import trDiscover from '../public/locales/tr/discover.json';
import trLanding from '../public/locales/tr/landing.json';
import trLegal from '../public/locales/tr/legal.json';
import trMcpServers from '../public/locales/tr/mcpServers.json';
import trNotifications from '../public/locales/tr/notifications.json';
import trPlayground from '../public/locales/tr/playground.json';
import trSearch from '../public/locales/tr/search.json';
import trSettings from '../public/locales/tr/settings.json';
import trSetupGuide from '../public/locales/tr/setupGuide.json';
import trSidebar from '../public/locales/tr/sidebar.json';
// Import other locale files as needed
// TODO: Add imports for hi, ja, nl, zh when translations are ready
import { defaultLocale, locales, namespaces } from './config';

// Resources object with all translations loaded statically
const resources = {
  en: {
    translation: {
      ...enCommon,
      ...enAuth,
      ...enDiscover,
      ...enLanding,
      ...enMcpServers,
      ...enSearch,
      ...enApiKeys,
      ...enLegal,
      ...enSidebar,
      ...enSettings,
      ...enSetupGuide,
      ...enPlayground,
      ...enNotifications
    },
    apiKeys: enApiKeys,
    auth: enAuth,
    common: enCommon,
    discover: enDiscover,
    landing: enLanding,
    legal: enLegal,
    mcpServers: enMcpServers,
    notifications: enNotifications,
    playground: enPlayground,
    search: enSearch,
    settings: enSettings,
    setupGuide: enSetupGuide,
    sidebar: enSidebar
  },
  tr: {
    translation: {
      ...trCommon,
      ...trAuth,
      ...trDiscover,
      ...trLanding,
      ...trMcpServers,
      ...trSearch,
      ...trApiKeys,
      ...trLegal,
      ...trSidebar,
      ...trSettings,
      ...trSetupGuide,
      ...trPlayground,
      ...trNotifications
    },
    apiKeys: trApiKeys,
    auth: trAuth,
    common: trCommon,
    discover: trDiscover,
    landing: trLanding,
    legal: trLegal,
    mcpServers: trMcpServers,
    notifications: trNotifications,
    playground: trPlayground,
    search: trSearch,
    settings: trSettings,
    setupGuide: trSetupGuide,
    sidebar: trSidebar
  }
  // Add other languages here when translations are ready
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
