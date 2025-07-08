'use client';

import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import { useSafeSession } from '@/hooks/use-safe-session';
import i18n from '@/i18n/client';
import { Locale, locales } from '@/i18n/config';

export function I18nProvider({
  children,
  initialLocale 
}: { 
  children: React.ReactNode;
  initialLocale?: string;
}) {
  const { data: session, status } = useSafeSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    async function loadLanguage() {
      // Don't run until component is mounted on client
      if (!mounted) {
        return;
      }

      // 1. If user is authenticated, try to get their profile language
      if (status === 'authenticated' && session?.user) {
        try {
          const response = await fetch('/api/profile/language');
          if (response.ok) {
            const { language } = await response.json();
            if (language && locales.includes(language as Locale)) {
              if (i18n.language !== language) {
                i18n.changeLanguage(language);
              }
              localStorage.setItem('pluggedin_language', language);
              return;
            }
          }
        } catch (error) {
          console.error('Failed to fetch profile language:', error);
        }
      }

      // Skip further processing if we're still loading session
      if (status === 'loading') {
        return;
      }

      // 2. Check localStorage
      const storedLang = localStorage.getItem('pluggedin_language');
      if (storedLang && locales.includes(storedLang as Locale)) {
        if (i18n.language !== storedLang) {
          i18n.changeLanguage(storedLang);
        }
        return;
      }

      // 3. Try browser detection
      const browserLang = navigator.language.split('-')[0];
      if (locales.includes(browserLang as Locale) && browserLang !== i18n.language) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug(`Detected browser language: ${browserLang}, setting language.`);
        }
        i18n.changeLanguage(browserLang);
        localStorage.setItem('pluggedin_language', browserLang);
      }

      // 4. If nothing else, use initialLocale (fallback)
      if (initialLocale && locales.includes(initialLocale as Locale) && i18n.language !== initialLocale) {
        i18n.changeLanguage(initialLocale);
      }
    }

    loadLanguage();
  }, [mounted, session, status, initialLocale]);

  return (
    // Explicitly pass the imported i18n instance
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  );
}
