'use client';

import { LegalDoc } from '../legal-doc';

export default function PrivacyPolicyPage() {
  return (
    <LegalDoc 
      title="Privacy Policy" 
      description="How we collect and process your data"
      lastUpdated="March 26, 2024"
    >
      <h2>Introduction</h2>
      <p>
        Welcome to Plugged.in ("we," "our," or "us"). This Privacy Policy explains how we collect, use, disclose, 
        and safeguard your information when you use our service. Please read this privacy policy carefully. 
        If you do not agree with the terms of this privacy policy, please do not access the service.
      </p>
      <p>
        <strong>IMPORTANT NOTE:</strong> Plugged.in is currently in Release Candidate status. This privacy policy 
        may be updated as the service matures and additional features are implemented.
      </p>

      <h2>Information We Collect</h2>
      <p>We may collect information about you in various ways:</p>

      <h3>1. Personal Data</h3>
      <p>
        When you register with Plugged.in, we may collect personally identifiable information, such as:
      </p>
      <ul>
        <li>Email address</li>
        <li>Name</li>
        <li>Username</li>
      </ul>

      <h3>2. MCP Server Data</h3>
      <p>
        We collect information about the Model Context Protocol (MCP) servers you configure and interact with, including:
      </p>
      <ul>
        <li>Server configurations</li>
        <li>Server names and descriptions</li>
        <li>Environmental variables (excluding sensitive credentials)</li>
      </ul>

      <h3>3. Usage Data</h3>
      <p>
        We may collect information on how the Service is accessed and used ("Usage Data"). This Usage Data may include 
        information such as your computer's Internet Protocol address (IP address), browser type, browser version, 
        the pages of our Service that you visit, the time and date of your visit, the time spent on those pages, 
        and other diagnostic data.
      </p>

      <h2>How We Use Your Information</h2>
      <p>We may use the information we collect for various purposes:</p>
      <ul>
        <li>To provide and maintain our Service</li>
        <li>To notify you about changes to our Service</li>
        <li>To provide customer support</li>
        <li>To gather analysis or valuable information so that we can improve our Service</li>
        <li>To monitor the usage of our Service</li>
        <li>To detect, prevent and address technical issues</li>
      </ul>

      <h2>Data Storage and Security</h2>
      <p>
        The security of your data is important to us, but remember that no method of transmission over the Internet, 
        or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect 
        your Personal Data, we cannot guarantee its absolute security.
      </p>
      <p>
        <strong>During the Release Candidate phase:</strong> We implement standard security practices but make no 
        guarantees about the security of your data. You are responsible for ensuring that sensitive information is 
        not stored within the service.
      </p>

      <h2>Service Providers</h2>
      <p>
        We may employ third-party companies and individuals to facilitate our Service ("Service Providers"), 
        to provide the Service on our behalf, to perform Service-related services or to assist us in analyzing 
        how our Service is used. These third parties have access to your Personal Data only to perform these tasks 
        on our behalf and are obligated not to disclose or use it for any other purpose.
      </p>

      <h2>Links to Other Sites</h2>
      <p>
        Our Service may contain links to other sites that are not operated by us. If you click on a third-party link, 
        you will be directed to that third party's site. We strongly advise you to review the Privacy Policy of every 
        site you visit.
      </p>
      <p>
        We have no control over and assume no responsibility for the content, privacy policies or practices of any 
        third-party sites or services.
      </p>

      <h2>Changes to This Privacy Policy</h2>
      <p>
        We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new 
        Privacy Policy on this page and updating the "last updated" date.
      </p>
      <p>
        You are advised to review this Privacy Policy periodically for any changes. Changes to this Privacy Policy 
        are effective when they are posted on this page.
      </p>

      <h2>Contact Us</h2>
      <p>
        If you have any questions about this Privacy Policy, please contact us:
      </p>
      <ul>
        <li>By visiting the <a href="/legal/contact">Contact page</a></li>
      </ul>
    </LegalDoc>
  );
} 