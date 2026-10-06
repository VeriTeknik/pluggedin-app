'use client';

import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useMounted } from '@/hooks/use-mounted';

const PROJECT_STATUS_URL =
  'https://github.com/VeriTeknik/pluggedin-app/blob/main/PROJECT_STATUS.md';

export function ProjectStatusNotice() {
  const mounted = useMounted();
  const { t, ready } = useTranslation('landing');

  if (!mounted || !ready) return null;

  return (
    <div
      role="note"
      className="w-full border-b border-amber-500/30 bg-amber-500/10 text-foreground"
    >
      <div className="container mx-auto flex items-start gap-3 px-4 py-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        <p>
          <strong className="font-semibold">{t('projectStatus.title')}</strong>{' '}
          {t('projectStatus.body')}{' '}
          <a
            href={PROJECT_STATUS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-4 hover:text-amber-500"
          >
            {t('projectStatus.link')}
          </a>
        </p>
      </div>
    </div>
  );
}
