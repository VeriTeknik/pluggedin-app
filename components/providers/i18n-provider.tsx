'use client';

import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';

import i18n from '@/i18n/client';
import { Locale, locales } from '@/i18n/config'; // Import config (removed defaultLocale)

export function I18nProvider({
  children,
  initialLocale 
}: { 
  children: React.ReactNode;
  initialLocale?: string;
}) {
  useEffect(() => {
    // If an initial locale is provided by the server, use it and stop.
    if (initialLocale) {
      if (i18n.language !== initialLocale) {
        i18n.changeLanguage(initialLocale);
      }
      // Ensure localStorage matches the server-provided locale
      localStorage.setItem('pluggedin_language', initialLocale);
      return; // Don't proceed with client-side detection if server provided locale
    }

    // --- Client-side detection (only if initialLocale was NOT provided) ---

    // Check localStorage first
    const storedLang = localStorage.getItem('pluggedin_language');
    if (storedLang && locales.includes(storedLang as Locale)) {
       if (i18n.language !== storedLang) {
         i18n.changeLanguage(storedLang);
       }
       return; // Stop if found in localStorage
    }

    // If no stored lang, try browser detection
    const browserLang = navigator.language.split('-')[0]; // Get base language
    if (locales.includes(browserLang as Locale) && browserLang !== i18n.language) {
       if (process.env.NODE_ENV !== 'production') {
         console.debug(`Detected browser language: ${browserLang}, setting language.`);
       }
       i18n.changeLanguage(browserLang);
       localStorage.setItem('pluggedin_language', browserLang); // Store detected language
    }

    // If still no language set, i18next will use the fallbackLng (defaultLocale)
  }, [initialLocale]); // Rerun if initialLocale changes

  return (
    // Explicitly pass the imported i18n instance
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  );
}
