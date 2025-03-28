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

export type Messages = typeof import('./locales/en.json');
export type MessageKey = keyof Messages;
