import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import { defaultLocale, locales } from './config';
// Import English chunks
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
// Import other locale files
import hi from './locales/hi.json';
import ja from './locales/ja.json';
import nl from './locales/nl.json';
import tr from './locales/tr.json';
import zh from './locales/zh.json';

const resources = {
  en: {
    translation: {
      ...enCommon,
      ...enAuth,
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
    }
  },
  tr: { translation: tr },
  nl: { translation: nl },
  zh: { translation: zh },
  ja: { translation: ja },
  hi: { translation: hi }
};

// Language detection options
const detectionOptions = {
  order: ['localStorage', 'navigator'],
  lookupLocalStorage: 'pluggedin_language',
  caches: ['localStorage']
};

i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: defaultLocale,
    supportedLngs: locales,
    detection: detectionOptions,
    interpolation: {
      escapeValue: false
    }
  });

export default i18next;
