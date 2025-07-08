import { defaultLocale } from '@/i18n/config';

import { I18nProvider } from './i18n-provider';

export function I18nProviderWrapper({
  children
}: {
  children: React.ReactNode;
}) {
  // Use default locale for static generation
  // The I18nProvider client component will handle dynamic language detection
  return (
    <I18nProvider initialLocale={defaultLocale}>
      {children}
    </I18nProvider>
  );
}
