'use client';

import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';

import i18n from '@/i18n/client';
import { defaultLocale, Locale, locales } from '@/i18n/config'; // Import config

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
      localStorage.setItem('pluggedin_language', initialLocale);
    }

    // After initial render, check localStorage
    const storedLang = localStorage.getItem('pluggedin_language');
    if (storedLang && storedLang !== initialLocale) {
      i18n.changeLanguage(storedLang);
    } else if (!storedLang && i18n.language === defaultLocale) {
      // If no stored lang and current lang is default, try browser detection
      const browserLang = navigator.language.split('-')[0]; // Get base language (e.g., 'en' from 'en-US')
      if (locales.includes(browserLang as Locale) && browserLang !== defaultLocale) {
        console.log(`Detected browser language: ${browserLang}, setting language.`);
        i18n.changeLanguage(browserLang);
        localStorage.setItem('pluggedin_language', browserLang);
      }
    }
  }, [initialLocale]); // Dependency array remains the same, effect runs once on mount/initialLocale change

  return (
    <I18nextProvider i18n={i18n}>
      {children}
    </I18nextProvider>
  );
}
