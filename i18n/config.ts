export const defaultLocale = 'en';

export const locales = ['en', 'tr'] as const;
export type Locale = typeof locales[number];

export const localeNames = {
  en: 'English',
  tr: 'Türkçe'
} as const;

export const isRTL = (locale: string): boolean => {
  const rtlLocales = ['ar', 'fa', 'he'];
  return rtlLocales.includes(locale);
};

export type Messages = typeof import('./locales/en.json');
export type MessageKey = keyof Messages;
