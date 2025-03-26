'use client';

import { LegalDoc } from '../legal-doc';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';

export default function DisclaimerPage() {
  const { t } = useTranslation();
  
  return (
    <LegalDoc 
      title={t('legal.pages.disclaimer.title')}
      description={t('legal.pages.disclaimer.description')}
      lastUpdated="March 26, 2024"
    >
      <h2>{t('legal.pages.disclaimer.content.title')}</h2>
      <p>{t('legal.pages.disclaimer.content.thirdParty')}</p>

      <h2>Release Candidate Status</h2>
      <p>
        <strong>IMPORTANT:</strong> Plugged.in is currently in Release Candidate status. This means that 
        the software is still undergoing testing and development. It is not yet a final release, and 
        you acknowledge that you are using pre-release software.
      </p>
      <p>
        As a Release Candidate:
      </p>
      <ul>
        <li>The service may contain bugs, errors, or other issues</li>
        <li>Features may be incomplete or subject to change</li>
        <li>Performance and stability may not be optimal</li>
        <li>Data persistence and security may have limitations</li>
      </ul>

      <h2>General Disclaimer</h2>
      <p>
        The information provided on Plugged.in is for general informational purposes only. We make no 
        representations or warranties of any kind, express or implied, about the completeness, accuracy, 
        reliability, suitability, or availability of the service or the information, products, services, 
        or related graphics contained on the service for any purpose.
      </p>
      <p>
        Any reliance you place on such information is therefore strictly at your own risk. In no event 
        will we be liable for any loss or damage including without limitation, indirect or consequential 
        loss or damage, or any loss or damage whatsoever arising from loss of data or profits arising out 
        of, or in connection with, the use of this service.
      </p>

      <h2>No Warranty</h2>
      <p>
        THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT ANY WARRANTY OR REPRESENTATION OF ANY KIND, 
        WHETHER EXPRESS, IMPLIED, OR STATUTORY. WE SPECIFICALLY DISCLAIM ANY IMPLIED WARRANTIES OF TITLE, 
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
      </p>
      <p>
        We do not warrant that:
      </p>
      <ul>
        <li>The service will be uninterrupted, timely, secure, or error-free</li>
        <li>The results that may be obtained from the use of the service will be accurate or reliable</li>
        <li>The quality of any products, services, information, or other material purchased or obtained 
            through the service will meet your expectations</li>
        <li>Any errors in the service will be corrected</li>
      </ul>

      <h2>Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL WE, OUR AFFILIATES, OR THEIR 
        RESPECTIVE OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, PUNITIVE, INCIDENTAL, 
        SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES, INCLUDING WITHOUT LIMITATION DAMAGES FOR LOSS OF PROFITS, 
        GOODWILL, USE, DATA, OR OTHER INTANGIBLE LOSSES, THAT RESULT FROM THE USE OF, OR INABILITY TO USE, 
        THE SERVICE.
      </p>
      <p>
        UNDER NO CIRCUMSTANCES WILL WE BE RESPONSIBLE FOR ANY DAMAGE, LOSS, OR INJURY RESULTING FROM HACKING, 
        TAMPERING, OR OTHER UNAUTHORIZED ACCESS OR USE OF THE SERVICE OR YOUR ACCOUNT OR THE INFORMATION 
        CONTAINED THEREIN.
      </p>
      <p>
        <strong>RELEASE CANDIDATE LIABILITY DISCLAIMER:</strong> DURING THE RELEASE CANDIDATE PHASE, WE ACCEPT 
        NO LIABILITY WHATSOEVER FOR ANY DATA LOSS, SYSTEM FAILURES, DOWNTIME, OR OTHER ISSUES THAT MAY ARISE 
        FROM YOUR USE OF THE SERVICE. YOU USE THE RELEASE CANDIDATE AT YOUR OWN RISK.
      </p>

      <h2>Third-Party Services</h2>
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
