'use client';

import { useTranslation } from 'react-i18next';

export function SettingsTitle() {
  const { t } = useTranslation();

  return (
    <h1 className="text-3xl font-bold mb-8">{t('settings.title')}</h1>
  );
} 