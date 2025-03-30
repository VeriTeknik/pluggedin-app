// Remove headers import as it forces dynamic rendering
// import { headers } from 'next/headers';

import { getActiveProfileLanguage } from '@/app/actions/profiles';
// Remove unused Locale and locales imports
import { defaultLocale } from '@/i18n/config';

import { I18nProvider } from './i18n-provider';

async function getInitialLocale(): Promise<string> {
  try {
    // First try to get language from active profile
    const profileLanguage = await getActiveProfileLanguage();
    if (profileLanguage) {
      return profileLanguage;
    }

    // Remove browser language detection using headers() on the server
    // Client-side detection will be handled in the I18nProvider client component

    // Always return defaultLocale if profile language is not found on the server
    return defaultLocale;

  } catch (error) {
    // Log the error for debugging, but still return default
    console.error("Failed to get active profile language:", error);
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
