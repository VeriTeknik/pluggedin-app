import { headers } from 'next/headers';

import { getActiveProfileLanguage } from '@/app/actions/profiles';
import { defaultLocale, Locale, locales } from '@/i18n/config';

import { I18nProvider } from './i18n-provider';

async function getInitialLocale(): Promise<string> {
  try {
    // First try to get language from active profile
    const profileLanguage = await getActiveProfileLanguage();
    if (profileLanguage) {
      return profileLanguage;
    }

    // Fallback to browser language
    const headersList = await headers();
    const acceptLanguage = headersList.get('accept-language');
    
    if (!acceptLanguage) {
      return defaultLocale;
    }
    
    // Get language from accept-language header
    const browserLocales = acceptLanguage.split(',')
      .map((locale: string) => locale.split(';')[0])
      .map((locale: string) => locale.split('-')[0]);
      
    // Find first matching locale
    const matchedLocale = browserLocales.find((locale: string) => 
      locales.includes(locale as Locale)
    );
    
    return matchedLocale || defaultLocale;
  } catch (_error) {
    // Fallback to default locale if headers are not available
    return defaultLocale;
  }
}

export async function I18nProviderWrapper({
  children
}: {
  children: React.ReactNode;
}) {
  const initialLocale = await getInitialLocale();
  
  return (
    <I18nProvider initialLocale={initialLocale}>
      {children}
    </I18nProvider>
  );
}
