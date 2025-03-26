'use client';

import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/client';
import { defaultLocale } from '@/i18n/config';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    const init = async () => {
      // During SSR and initial mount, use default locale
      if (!isClient) {
        await i18n.changeLanguage(defaultLocale);
      }
      
      // After mount, check localStorage
      const storedLang = localStorage.getItem('pluggedin_language');
      if (storedLang) {
        await i18n.changeLanguage(storedLang);
      }
      
      setIsClient(true);
    };
    init();
  }, [isClient]);
  
  return (
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  );
}
