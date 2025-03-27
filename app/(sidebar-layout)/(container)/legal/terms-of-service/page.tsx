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
      lastUpdated="March 26, 2024"
    >
      <h2>Introduction</h2>
      <p>{t('legal.pages.terms.content.intro')}</p>

      <h2>{t('legal.pages.terms.content.responsibilities.title')}</h2>
      <ul>
        <li>{t('legal.pages.terms.content.responsibilities.items.0')}</li>
        <li>{t('legal.pages.terms.content.responsibilities.items.1')}</li>
        <li>{t('legal.pages.terms.content.responsibilities.items.2')}</li>
      </ul>

      <h2>Changes to Terms</h2>
      <p>
        We may modify these Terms at any time. It is your responsibility to review these Terms periodically. 
        Your continued use of Plugged.in after any changes indicates your acceptance of the modified Terms.
      </p>

      <h2>Account Registration and Security</h2>
      <p>
        To use certain features of Plugged.in, you may need to create an account. You are responsible for:
      </p>
      <ul>
        <li>Providing accurate account information</li>
        <li>Maintaining the security of your account credentials</li>
        <li>All activities that occur under your account</li>
      </ul>
      <p>
        We reserve the right to disable your account if we have reason to believe that you have violated these Terms.
      </p>

      <h2>MCP Servers and Tools</h2>
      <p>
        Plugged.in provides a platform for managing and using Model Context Protocol (MCP) servers and tools. You agree to:
      </p>
      <ul>
        <li>Use MCP servers and tools in compliance with applicable laws and regulations</li>
        <li>Not use MCP servers for any illegal or unauthorized purpose</li>
        <li>Take responsibility for MCP servers you configure or deploy</li>
      </ul>

      <h2>Intellectual Property</h2>
      <p>
        Plugged.in and its content, features, and functionality are owned by us and are protected by copyright, 
        trademark, and other intellectual property laws. You may not copy, modify, distribute, or create derivative 
        works based on Plugged.in without our explicit permission.
      </p>

      <h2>Third-Party Services</h2>
      <p>{t('legal.pages.disclaimer.content.thirdParty')}</p>

      <h2>Contact Us</h2>
      <p>{t('legal.pages.contact.content.description')}</p>
      <ul>
        <li>
          <Link href="/legal/contact">{t('legal.pages.contact.title')}</Link>
        </li>
      </ul>
    </LegalDoc>
  );
}
