'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { LegalDoc } from '../legal-doc';

export default function PrivacyPolicyPage() {
  const { t } = useTranslation('legal');
  
  return (
    <LegalDoc 
      title={t('legal.pages.privacy.title')}
      description={t('legal.pages.privacy.description')}
      lastUpdated="January 29, 2025"
    >
      <h2>{t('legal.pages.privacy.sections.introduction.title')}</h2>
      <p>{t('legal.pages.privacy.sections.introduction.content')}</p>

      <h2>{t('legal.pages.privacy.sections.controller.title')}</h2>
      <p>{t('legal.pages.privacy.sections.controller.intro')}</p>
      <ul>
        <li><strong>{t('legal.pages.privacy.sections.controller.company')}</strong> {t('legal.pages.privacy.sections.controller.companyName')}</li>
        <li><strong>{t('legal.pages.privacy.sections.controller.address')}</strong> {t('legal.pages.privacy.sections.controller.addressDetails')}</li>
        <li><strong>{t('legal.pages.privacy.sections.controller.email')}</strong> {t('legal.pages.privacy.sections.controller.emailAddress')}</li>
      </ul>

      <h2>{t('legal.pages.privacy.sections.dataCollection.title')}</h2>
      <p>{t('legal.pages.privacy.sections.dataCollection.intro')}</p>
      
      <h3>{t('legal.pages.privacy.sections.dataCollection.account.title')}</h3>
      <ul>
        <li>{t('legal.pages.privacy.sections.dataCollection.account.email')}</li>
        <li>{t('legal.pages.privacy.sections.dataCollection.account.name')}</li>
        <li>{t('legal.pages.privacy.sections.dataCollection.account.username')}</li>
        <li>{t('legal.pages.privacy.sections.dataCollection.account.bio')}</li>
        <li>{t('legal.pages.privacy.sections.dataCollection.account.avatar')}</li>
        <li>{t('legal.pages.privacy.sections.dataCollection.account.language')}</li>
      </ul>

      <h3>{t('legal.pages.privacy.sections.dataCollection.auth.title')}</h3>
      <ul>
        <li>{t('legal.pages.privacy.sections.dataCollection.auth.oauth')}</li>
        <li>{t('legal.pages.privacy.sections.dataCollection.auth.providers')}</li>
      </ul>

      <h3>{t('legal.pages.privacy.sections.dataCollection.usage.title')}</h3>
      <ul>
        <li>{t('legal.pages.privacy.sections.dataCollection.usage.projects')}</li>
        <li>{t('legal.pages.privacy.sections.dataCollection.usage.servers')}</li>
        <li>{t('legal.pages.privacy.sections.dataCollection.usage.social')}</li>
        <li>{t('legal.pages.privacy.sections.dataCollection.usage.documents')}</li>
        <li>{t('legal.pages.privacy.sections.dataCollection.usage.logs')}</li>
      </ul>

      <h3>{t('legal.pages.privacy.sections.dataCollection.technical.title')}</h3>
      <ul>
        <li>{t('legal.pages.privacy.sections.dataCollection.technical.analytics')}</li>
        <li>{t('legal.pages.privacy.sections.dataCollection.technical.cookies')}</li>
        <li>{t('legal.pages.privacy.sections.dataCollection.technical.localStorage')}</li>
      </ul>

      <h2>{t('legal.pages.privacy.sections.legalBasis.title')}</h2>
      <p>{t('legal.pages.privacy.sections.legalBasis.intro')}</p>
      <ul>
        <li><strong>{t('legal.pages.privacy.sections.legalBasis.contract.title')}</strong> {t('legal.pages.privacy.sections.legalBasis.contract.desc')}</li>
        <li><strong>{t('legal.pages.privacy.sections.legalBasis.legitimate.title')}</strong> {t('legal.pages.privacy.sections.legalBasis.legitimate.desc')}</li>
        <li><strong>{t('legal.pages.privacy.sections.legalBasis.consent.title')}</strong> {t('legal.pages.privacy.sections.legalBasis.consent.desc')}</li>
        <li><strong>{t('legal.pages.privacy.sections.legalBasis.legal.title')}</strong> {t('legal.pages.privacy.sections.legalBasis.legal.desc')}</li>
      </ul>

      <h2>{t('legal.pages.privacy.sections.dataUse.title')}</h2>
      <p>{t('legal.pages.privacy.sections.dataUse.intro')}</p>
      <ul>
        <li>{t('legal.pages.privacy.sections.dataUse.service')}</li>
        <li>{t('legal.pages.privacy.sections.dataUse.communication')}</li>
        <li>{t('legal.pages.privacy.sections.dataUse.security')}</li>
        <li>{t('legal.pages.privacy.sections.dataUse.improvement')}</li>
        <li>{t('legal.pages.privacy.sections.dataUse.legal')}</li>
      </ul>

      <h2>{t('legal.pages.privacy.sections.rights.title')}</h2>
      <p>{t('legal.pages.privacy.sections.rights.intro')}</p>
      <ul>
        <li><strong>{t('legal.pages.privacy.sections.rights.access.title')}</strong> {t('legal.pages.privacy.sections.rights.access.desc')}</li>
        <li><strong>{t('legal.pages.privacy.sections.rights.rectification.title')}</strong> {t('legal.pages.privacy.sections.rights.rectification.desc')}</li>
        <li><strong>{t('legal.pages.privacy.sections.rights.erasure.title')}</strong> {t('legal.pages.privacy.sections.rights.erasure.desc')}</li>
        <li><strong>{t('legal.pages.privacy.sections.rights.portability.title')}</strong> {t('legal.pages.privacy.sections.rights.portability.desc')}</li>
        <li><strong>{t('legal.pages.privacy.sections.rights.object.title')}</strong> {t('legal.pages.privacy.sections.rights.object.desc')}</li>
        <li><strong>{t('legal.pages.privacy.sections.rights.restriction.title')}</strong> {t('legal.pages.privacy.sections.rights.restriction.desc')}</li>
        <li><strong>{t('legal.pages.privacy.sections.rights.withdraw.title')}</strong> {t('legal.pages.privacy.sections.rights.withdraw.desc')}</li>
        <li><strong>{t('legal.pages.privacy.sections.rights.complaint.title')}</strong> {t('legal.pages.privacy.sections.rights.complaint.desc')}</li>
      </ul>
      <p>{t('legal.pages.privacy.sections.rights.exercise')}</p>

      <h2>{t('legal.pages.privacy.sections.sharing.title')}</h2>
      <p>{t('legal.pages.privacy.sections.sharing.intro')}</p>
      <ul>
        <li><strong>{t('legal.pages.privacy.sections.sharing.providers.title')}</strong> {t('legal.pages.privacy.sections.sharing.providers.desc')}</li>
        <li><strong>{t('legal.pages.privacy.sections.sharing.legal.title')}</strong> {t('legal.pages.privacy.sections.sharing.legal.desc')}</li>
        <li><strong>{t('legal.pages.privacy.sections.sharing.consent.title')}</strong> {t('legal.pages.privacy.sections.sharing.consent.desc')}</li>
      </ul>

      <h2>{t('legal.pages.privacy.sections.thirdParty.title')}</h2>
      <p>{t('legal.pages.privacy.sections.thirdParty.intro')}</p>
      <ul>
        <li><strong>{t('legal.pages.privacy.sections.thirdParty.auth.title')}</strong> {t('legal.pages.privacy.sections.thirdParty.auth.desc')}</li>
        <li><strong>{t('legal.pages.privacy.sections.thirdParty.analytics.title')}</strong> {t('legal.pages.privacy.sections.thirdParty.analytics.desc')}</li>
        <li><strong>{t('legal.pages.privacy.sections.thirdParty.email.title')}</strong> {t('legal.pages.privacy.sections.thirdParty.email.desc')}</li>
      </ul>

      <h2>{t('legal.pages.privacy.sections.retention.title')}</h2>
      <p>{t('legal.pages.privacy.sections.retention.intro')}</p>
      <ul>
        <li><strong>{t('legal.pages.privacy.sections.retention.account.title')}</strong> {t('legal.pages.privacy.sections.retention.account.desc')}</li>
        <li><strong>{t('legal.pages.privacy.sections.retention.logs.title')}</strong> {t('legal.pages.privacy.sections.retention.logs.desc')}</li>
        <li><strong>{t('legal.pages.privacy.sections.retention.deleted.title')}</strong> {t('legal.pages.privacy.sections.retention.deleted.desc')}</li>
      </ul>

      <h2>{t('legal.pages.privacy.sections.international.title')}</h2>
      <p>{t('legal.pages.privacy.sections.international.content')}</p>

      <h2>{t('legal.pages.privacy.sections.security.title')}</h2>
      <p>{t('legal.pages.privacy.sections.security.intro')}</p>
      <ul>
        <li>{t('legal.pages.privacy.sections.security.encryption')}</li>
        <li>{t('legal.pages.privacy.sections.security.access')}</li>
        <li>{t('legal.pages.privacy.sections.security.monitoring')}</li>
        <li>{t('legal.pages.privacy.sections.security.validation')}</li>
      </ul>
      
      <h3>{t('legal.pages.privacy.sections.security.mcpEncryption.title')}</h3>
      <p>{t('legal.pages.privacy.sections.security.mcpEncryption.desc')}</p>
      <ul>
        <li>{t('legal.pages.privacy.sections.security.mcpEncryption.items.0')}</li>
        <li>{t('legal.pages.privacy.sections.security.mcpEncryption.items.1')}</li>
        <li>{t('legal.pages.privacy.sections.security.mcpEncryption.items.2')}</li>
        <li>{t('legal.pages.privacy.sections.security.mcpEncryption.items.3')}</li>
      </ul>

      <h2>{t('legal.pages.privacy.sections.cookies.title')}</h2>
      <p>{t('legal.pages.privacy.sections.cookies.intro')}</p>
      <ul>
        <li><strong>{t('legal.pages.privacy.sections.cookies.essential.title')}</strong> {t('legal.pages.privacy.sections.cookies.essential.desc')}</li>
        <li><strong>{t('legal.pages.privacy.sections.cookies.analytics.title')}</strong> {t('legal.pages.privacy.sections.cookies.analytics.desc')}</li>
      </ul>
      <p>{t('legal.pages.privacy.sections.cookies.localStorage')}</p>

      <h2>{t('legal.pages.privacy.sections.children.title')}</h2>
      <p>{t('legal.pages.privacy.sections.children.content')}</p>

      <h2>{t('legal.pages.privacy.sections.changes.title')}</h2>
      <p>{t('legal.pages.privacy.sections.changes.content')}</p>

      <h2>{t('legal.pages.privacy.sections.contact.title')}</h2>
      <p>{t('legal.pages.privacy.sections.contact.intro')}</p>
      <ul>
        <li><strong>{t('legal.pages.privacy.sections.contact.email.title')}</strong> {t('legal.pages.privacy.sections.contact.email.address')}</li>
        <li><strong>{t('legal.pages.privacy.sections.contact.form.title')}</strong> <Link href="/legal/contact">{t('legal.pages.privacy.sections.contact.form.link')}</Link></li>
        <li><strong>{t('legal.pages.privacy.sections.contact.dpa.title')}</strong> {t('legal.pages.privacy.sections.contact.dpa.desc')}</li>
      </ul>
    </LegalDoc>
  );
}
