'use client';

import { LegalDoc } from '../legal-doc';

export default function TermsOfServicePage() {
  return (
    <LegalDoc 
      title="Terms of Service" 
      description="Rules and conditions for using Plugged.in"
      lastUpdated="March 26, 2024"
    >
      <h2>Introduction</h2>
      <p>
        Welcome to Plugged.in! These Terms of Service ("Terms") govern your access to and use of the Plugged.in 
        platform and services. Please read these Terms carefully. By accessing or using Plugged.in, you agree 
        to be bound by these Terms.
      </p>
      <p>
        <strong>IMPORTANT NOTICE:</strong> Plugged.in is currently in Release Candidate status. This means that 
        the software is still undergoing testing and development, and these Terms of Service may change as 
        the platform evolves.
      </p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using Plugged.in, you agree to these Terms and any additional terms that may apply. 
        If you do not agree to these Terms, you must not access or use Plugged.in.
      </p>

      <h2>2. Changes to Terms</h2>
      <p>
        We may modify these Terms at any time. It is your responsibility to review these Terms periodically. 
        Your continued use of Plugged.in after any changes indicates your acceptance of the modified Terms.
      </p>

      <h2>3. Account Registration and Security</h2>
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

      <h2>4. MCP Servers and Tools</h2>
      <p>
        Plugged.in provides a platform for managing and using Model Context Protocol (MCP) servers and tools. You agree to:
      </p>
      <ul>
        <li>Use MCP servers and tools in compliance with applicable laws and regulations</li>
        <li>Not use MCP servers for any illegal or unauthorized purpose</li>
        <li>Take responsibility for MCP servers you configure or deploy</li>
      </ul>

      <h2>5. Intellectual Property</h2>
      <p>
        Plugged.in and its content, features, and functionality are owned by us and are protected by copyright, 
        trademark, and other intellectual property laws. You may not copy, modify, distribute, or create derivative 
        works based on Plugged.in without our explicit permission.
      </p>

      <h2>6. User Content</h2>
      <p>
        You retain ownership of any content you submit to Plugged.in. By submitting content, you grant us a 
        non-exclusive, transferable, sub-licensable, royalty-free, worldwide license to use, copy, modify, 
        and display your content in connection with operating and improving Plugged.in.
      </p>

      <h2>7. Release Candidate Status</h2>
      <p>
        As Plugged.in is in Release Candidate status:
      </p>
      <ul>
        <li>The service may contain bugs or errors</li>
        <li>Features may change or be removed without notice</li>
        <li>Service stability is not guaranteed</li>
        <li>Data persistence is not guaranteed</li>
      </ul>
      <p>
        You acknowledge that you are using a pre-release version of the software and accept the risks associated with it.
      </p>

      <h2>8. Disclaimer of Warranties</h2>
      <p>
        PLUGGED.IN IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. 
        TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF 
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
      </p>

      <h2>9. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL WE BE LIABLE FOR ANY INDIRECT, INCIDENTAL, 
        SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF PLUGGED.IN, 
        EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
      </p>
      <p>
        DURING THE RELEASE CANDIDATE PHASE, WE ACCEPT NO LIABILITY FOR ANY DATA LOSS, SYSTEM FAILURES, OR OTHER 
        ISSUES THAT MAY ARISE FROM YOUR USE OF THE SERVICE.
      </p>

      <h2>10. Termination</h2>
      <p>
        We may terminate or suspend your access to Plugged.in immediately, without prior notice or liability, 
        for any reason, including if you breach these Terms. Upon termination, your right to use Plugged.in will 
        immediately cease.
      </p>

      <h2>11. Governing Law</h2>
      <p>
        These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which 
        we are established, without regard to its conflict of law provisions.
      </p>

      <h2>12. Contact Us</h2>
      <p>
        If you have any questions about these Terms, please contact us:
      </p>
      <ul>
        <li>By visiting the <a href="/legal/contact">Contact page</a></li>
      </ul>
    </LegalDoc>
  );
} 