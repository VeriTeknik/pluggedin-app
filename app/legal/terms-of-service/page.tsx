'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { LegalDoc } from '../legal-doc';

export default function TermsOfServicePage() {
  const { t } = useTranslation('legal');
  
  const responsibilityItems = t('legal.pages.terms.content.responsibilities.items', { returnObjects: true }) as string[];
  const accountItems = t('legal.pages.terms.content.account.items', { returnObjects: true }) as string[];
  const mcpItems = t('legal.pages.terms.content.mcp.items', { returnObjects: true }) as string[];
  
  return (
    <LegalDoc 
      title={t('legal.pages.terms.title')}
      description={t('legal.pages.terms.description')}
      lastUpdated="26 March 2024"
    >
      <h2>{t('legal.pages.terms.content.intro')}</h2>
      <p>{t('legal.pages.terms.content.intro')}</p>

      <h2>{t('legal.pages.terms.content.responsibilities.title')}</h2>
      <ul>
        {responsibilityItems.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>

      <h2>{t('legal.pages.terms.content.changes.title')}</h2>
      <p>{t('legal.pages.terms.content.changes.description')}</p>

      <h2>{t('legal.pages.terms.content.account.title')}</h2>
      <p>{t('legal.pages.terms.content.account.description')}</p>
      <ul>
        {accountItems.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
      <p>{t('legal.pages.terms.content.account.note')}</p>

      <h2>{t('legal.pages.terms.content.mcp.title')}</h2>
      <p>{t('legal.pages.terms.content.mcp.description')}</p>
      <ul>
        {mcpItems.map((item, index) => (
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
          <Link href="/legal/contact" className="text-primary hover:underline">
            {t('legal.pages.contact.title')}
          </Link>
        </li>
      </ul>
    </LegalDoc>
  );
}