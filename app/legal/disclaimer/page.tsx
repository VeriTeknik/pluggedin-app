'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { LegalDoc } from '../legal-doc';

export default function DisclaimerPage() {
  const { t } = useTranslation('legal');
  
  return (
    <LegalDoc 
      title={t('legal.pages.disclaimer.title')}
      description={t('legal.pages.disclaimer.description')}
      lastUpdated="26 Mart 2024"
    >
      <h2>{t('legal.pages.disclaimer.content.title')}</h2>
      <p>{t('legal.pages.disclaimer.content.thirdParty')}</p>

      <h2>{t('legal.pages.disclaimer.content.releaseCandidate.title')}</h2>
      <p>
        <strong>{t('legal.pages.disclaimer.content.releaseCandidate.important')}:</strong> {t('legal.pages.disclaimer.content.releaseCandidate.status')}
      </p>
      <p>
        {t('legal.pages.disclaimer.content.releaseCandidate.note')}
      </p>
      <ul>
        {t('legal.pages.disclaimer.content.releaseCandidate.items', { returnObjects: true }).map((item: string, index: number) => (
          <li key={index}>{item}</li>
        ))}
      </ul>

      <h2>{t('legal.pages.disclaimer.content.general.title')}</h2>
      <p>{t('legal.pages.disclaimer.content.general.description')}</p>
      <p>{t('legal.pages.disclaimer.content.general.risk')}</p>

      <h2>{t('legal.pages.disclaimer.content.warranty.title')}</h2>
      <p>{t('legal.pages.disclaimer.content.warranty.description')}</p>
      <p>{t('legal.pages.disclaimer.content.warranty.note')}</p>
      <ul>
        {t('legal.pages.disclaimer.content.warranty.items', { returnObjects: true }).map((item: string, index: number) => (
          <li key={index}>{item}</li>
        ))}
      </ul>

      <h2>{t('legal.pages.disclaimer.content.liability.title')}</h2>
      <p>{t('legal.pages.disclaimer.content.liability.description')}</p>
      <p>{t('legal.pages.disclaimer.content.liability.security')}</p>
      <p>
        <strong>{t('legal.pages.disclaimer.content.releaseCandidate.important')}:</strong> {t('legal.pages.disclaimer.content.liability.rcDisclaimer')}
      </p>

      <h2>{t('legal.pages.disclaimer.title')}</h2>
      <p>{t('legal.pages.disclaimer.content.thirdParty')}</p>

      <h2>{t('legal.pages.contact.title')}</h2>
      <p>{t('legal.pages.contact.content.description')}</p>
      <ul>
        <li>
          <Link href="/legal/contact">{t('legal.pages.contact.title')}</Link>
        </li>
      </ul>
    </LegalDoc>
  );
}
