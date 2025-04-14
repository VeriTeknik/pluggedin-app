'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { LegalDoc } from '../legal-doc';

export default function TermsOfServicePage() {
  const { t } = useTranslation();
  
  return (
    <LegalDoc 
      title={t('legal.pages.terms.title')}
      description={t('legal.pages.terms.description')}
      lastUpdated="26 Mart 2024"
    >
      <h2>{t('legal.pages.terms.content.intro')}</h2>
      <p>{t('legal.pages.terms.content.intro')}</p>

      <h2>{t('legal.pages.terms.content.responsibilities.title')}</h2>
      <ul>
        <li>{t('legal.pages.terms.content.responsibilities.items.0')}</li>
        <li>{t('legal.pages.terms.content.responsibilities.items.1')}</li>
        <li>{t('legal.pages.terms.content.responsibilities.items.2')}</li>
      </ul>

      <h2>{t('legal.pages.terms.content.changes.title')}</h2>
      <p>{t('legal.pages.terms.content.changes.description')}</p>

      <h2>{t('legal.pages.terms.content.account.title')}</h2>
      <p>{t('legal.pages.terms.content.account.description')}</p>
      <ul>
        {t('legal.pages.terms.content.account.items', { returnObjects: true }).map((item: string, index: number) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
      <p>{t('legal.pages.terms.content.account.note')}</p>

      <h2>{t('legal.pages.terms.content.mcp.title')}</h2>
      <p>{t('legal.pages.terms.content.mcp.description')}</p>
      <ul>
        {t('legal.pages.terms.content.mcp.items', { returnObjects: true }).map((item: string, index: number) => (
          <li key={index}>{item}</li>
        ))}
      </ul>

      <h2>{t('legal.pages.terms.content.intellectual.title')}</h2>
      <p>{t('legal.pages.terms.content.intellectual.description')}</p>

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
