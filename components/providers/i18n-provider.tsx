'use client';

import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/client';

export function I18nProvider({ 
  children,
  initialLocale 
}: { 
  children: React.ReactNode;
  initialLocale?: string;
}) {
  useEffect(() => {
    // Set initial locale synchronously to match server
    if (initialLocale) {
      i18n.changeLanguage(initialLocale);
    }

    // After initial render, check localStorage
    const storedLang = localStorage.getItem('pluggedin_language');
    if (storedLang && storedLang !== initialLocale) {
      i18n.changeLanguage(storedLang);
    }
  }, [initialLocale]);
  
  return (
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  );
}
