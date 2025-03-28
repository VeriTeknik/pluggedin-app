import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { defaultLocale, locales } from './config';

// Import all locale files
import en from './locales/en.json';
import tr from './locales/tr.json';
import nl from './locales/nl.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import hi from './locales/hi.json';

const resources = {
  en: { translation: en },
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
