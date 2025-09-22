import crypto from 'crypto';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { emailTrackingTable, scheduledEmailsTable, users } from '@/db/schema';
import { sendEmail } from '@/lib/email';

export type UserSegment = 'general' | 'developer' | 'security_focused' | 'enterprise';

export interface WelcomeEmailOptions {
  name: string;
  email: string;
  segment?: UserSegment;
  signupSource?: string;
  trialUser?: boolean;
}

export interface UserMetrics {
  documentCount: number;
  queryCount: number;
  knowledgeItems: number;
  lastActive?: Date;
}

/**
 * Determine user segment based on email domain and other factors
 */
export function determineUserSegment(email: string, signupSource?: string): UserSegment {
  const domain = email.split('@')[1]?.toLowerCase();
  
  // Enterprise domains (Fortune 500, large companies)
  const enterpriseDomains = ['ibm.com', 'microsoft.com', 'google.com', 'amazon.com', 'apple.com', 'meta.com', 'oracle.com', 'salesforce.com'];
  if (domain && enterpriseDomains.some(d => domain.includes(d))) {
    return 'enterprise';
  }
  
  // Security-focused indicators
  const securityDomains = ['security', 'cyber', 'defense', '.gov', '.mil', 'bank', 'financial'];
  const securitySources = ['security-audit', 'compliance', 'gdpr'];
  if (
    (domain && securityDomains.some(d => domain.includes(d))) ||
    (signupSource && securitySources.includes(signupSource))
  ) {
    return 'security_focused';
  }
  
  // Developer indicators
  const developerDomains = ['github.com', 'gitlab.com', 'dev.', '.dev', '.io', 'vercel.com', 'netlify.com'];
  const developerSources = ['api', 'github', 'technical-docs', 'npm', 'docker'];
  if (
    (domain && developerDomains.some(d => domain.includes(d))) ||
    (signupSource && developerSources.includes(signupSource))
  ) {
    return 'developer';
  }
  
  // Default to general for most users
  return 'general';
}

/**
 * Get the appropriate subject line for the welcome email
 */
function getWelcomeSubject(segment: UserSegment, abVariant: 'A' | 'B' = 'A'): string {
  const subjects = {
    general: {
      A: 'Welcome to Plugged.in — Your AI data belongs to you',
      B: "You're in! Let's make AI work for you",
    },
    developer: {
      A: 'Welcome to Plugged.in — Full MCP protocol support',
      B: "Let's ship your first MCP integration",
    },
    security_focused: {
      A: 'Welcome to Plugged.in — End-to-end encrypted AI workspace',
      B: 'Your secure AI command center is ready',
    },
    enterprise: {
      A: "Welcome to Plugged.in Enterprise — Your team's AI infrastructure",
      B: "{{company_name}}'s secure AI workspace is ready",
    },
  };
  
  return subjects[segment][abVariant];
}

/**
 * Generate welcome email HTML based on user segment
 */
function generateWelcomeHtml(options: WelcomeEmailOptions & { segment: UserSegment }): string {
  const { name, email, segment } = options;
  const firstName = name.split(' ')[0];
  const appUrl = process.env.NEXTAUTH_URL || 'https://app.plugged.in';
  
  // Common styles
  const styles = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    a { color: #4F46E5; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white !important; border-radius: 6px; text-decoration: none !important; margin: 16px 0; }
    .button:hover { background: #4338CA; }
    pre, code { background: #f6f6f6; padding: 12px; border-radius: 4px; font-family: 'Monaco', 'Courier New', monospace; }
    .footer { color: #666; font-size: 0.9em; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; }
  `;
  
  // General user template (default)
  if (segment === 'general') {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${styles}</style>
      </head>
      <body>
        <div class="container">
          <p>Hi ${firstName}, I'm Cem 👋</p>
          
          <p>I'm the founder (and chief code-wrangler 🐱) at Plugged.in.<br>
          I started this platform with one belief: <strong>your AI data should always
          belong to you</strong> — not be scattered across services you can't control.</p>
          
          <p>Here's what makes Plugged.in different:</p>
          <ul>
            <li>📚 Your documents + AI knowledge base, encrypted end-to-end</li>
            <li>🔔 Smart notifications when your AI completes tasks</li>
            <li>💾 Every interaction, securely stored under <em>your</em> ownership</li>
            <li>🔐 OAuth-based integrations — no password juggling</li>
          </ul>
          
          <p>You don't need extra servers to get started — we built the essentials in:</p>
          <ul>
            <li><strong>Document Management:</strong> upload once, and your AI remembers</li>
            <li><strong>Sequential Thinking:</strong> for complex multi-step reasoning</li>
            <li><strong>Database Tools:</strong> connect & query your own data securely</li>
          </ul>

          <p>🎁 <strong>We've added 3 sample MCP servers to get you started:</strong></p>
          <ul>
            <li><strong>Context7:</strong> Access up-to-date documentation for any library<br>
                <em style="font-size: 0.9em;">→ Get your API key from <a href="https://context7.com/dashboard">context7.com/dashboard</a></em><br>
                <em style="font-size: 0.9em;">→ Go to <a href="${appUrl}/mcp-servers">MCP Servers</a>, click Edit on Context7</em><br>
                <em style="font-size: 0.9em;">→ Add to Headers:</em><br>
                <code style="font-size: 0.85em; display: inline-block; margin-left: 20px;">Authorization: Bearer YOUR_API_KEY</code></li>
            <li><strong>Whois:</strong> Domain lookup capabilities (ready to use!)</li>
            <li><strong>Random Number Generator:</strong> Test MCP functionality (ready to use!)</li>
          </ul>

          <p>🤖 <strong>Connect to your favorite AI:</strong><br>
          Ready to use with Claude Desktop, Continue Dev, or any MCP-compatible client.<br>
          <a href="https://plugged.in/setup-guide">Setup Guide</a> | <a href="https://docs.plugged.in">Documentation</a></p>

          <p>Best first step?<br>
          <a href="${appUrl}/library" class="button">📄 Upload your first document</a><br>
          It takes 30 seconds — and your AI immediately becomes more useful.<br>
          <em style="font-size: 0.9em;">Your uploaded docs will be available in Claude Desktop via "Ask Knowledge Base" or "List Documents" tools!</em></p>
          
          <p>If you're curious about integrations,<br>
          <a href="${appUrl}/mcp-server">browse the MCP marketplace</a><br>
          (50+ tools, all running through our secure proxy).</p>
          
          <p>Want to talk shop, share feedback, or just send a cat emoji?<br>
          Hit reply — I read every message myself.</p>
          
          <p>Welcome to true AI data ownership,<br>
          Cem 🐾<br>
          Founder @ Plugged.in</p>
          
          <div class="footer">
            <p>P.S. We ship updates weekly! Check out <a href="${appUrl}/release-notes">what's new</a> — latest: end-to-end encryption for all MCP configs. 🔒</p>
            <p><a href="${appUrl}/unsubscribe?token=${Buffer.from(email).toString('base64')}">Unsubscribe</a> |
            <a href="${appUrl}/settings">Email Preferences</a> |
            <a href="https://docs.plugged.in">Documentation</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  
  // Developer variant
  if (segment === 'developer') {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${styles}</style>
      </head>
      <body>
        <div class="container">
          <p>Hey ${firstName}, I'm Cem 👋</p>

          <p>Fellow dev here. I built Plugged.in because I was tired of my AI workflows being scattered across random services.</p>

          <p>Here's what might make you smile:</p>
          <ul>
            <li>🔧 Full MCP protocol support (v1.4.0, Registry v2)</li>
            <li>📦 npm: <code>@pluggedin/pluggedin-mcp-proxy</code></li>
            <li>🐳 Docker containers tuned for prod</li>
            <li>⚡ Lazy auth for Smithery compatibility</li>
            <li>🔐 Configs stored with E2E encryption</li>
          </ul>

          <p>Built-in MCP servers, no setup drama:</p>
          <pre>
- Document management (RAG)
- PostgreSQL connector
- Sequential thinking
- Notifications</pre>

          <p>🎁 <strong>Sample servers already in your workspace:</strong></p>
          <pre style="font-size: 0.9em;">
- Context7 (API docs for any library)
  → Get API key: context7.com/dashboard
  → Edit server in /mcp-servers
  → Add Header: Authorization: Bearer KEY
- Whois (domain lookups) - ready to use
- Random Number Generator - ready to use</pre>

          <p>🤖 <strong>Connect to Claude Desktop or Continue Dev:</strong><br>
          <code>npm install -g @pluggedin/pluggedin-mcp-proxy</code><br>
          📚 Resources: <a href="https://plugged.in/setup-guide">Setup Guide</a> | <a href="https://docs.plugged.in">Documentation</a></p>

          <p>Quick dev start:</p>
          <ol>
            <li><a href="${appUrl}/api-keys">Generate an API key</a></li>
            <li><code>npm install @pluggedin/pluggedin-mcp-proxy</code></li>
            <li><a href="https://docs.plugged.in/quickstart">Check the docs</a></li>
          </ol>

          <p>Code's evolving fast. Want to contribute, lurk, or just talk shop? Hit reply.</p>

          <p>Happy hacking 🐾,<br>
          Cem<br>
          Founder @ Plugged.in</p>

          <div class="footer">
            <p>P.S. Track our progress: <a href="${appUrl}/release-notes">Release Notes</a> | <a href="https://github.com/VeriTeknik">GitHub</a> — watch us ship in real time! 🚀</p>
            <p><a href="${appUrl}/unsubscribe?token=${Buffer.from(email).toString('base64')}">Unsubscribe</a> |
            <a href="${appUrl}/settings">Email Preferences</a> |
            <a href="https://docs.plugged.in">Documentation</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  
  // Security-focused variant
  if (segment === 'security_focused') {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${styles}</style>
      </head>
      <body>
        <div class="container">
          <p>Hi ${firstName}, I'm Cem 👋</p>

          <p>You joined Plugged.in because you care about <strong>security</strong> — so do I.<br>
          That's why I built this platform from the ground up for <em>data ownership</em>.</p>

          <ul>
            <li>🔐 End-to-end encryption across all features</li>
            <li>🚫 Your data never trains other models</li>
            <li>🏠 Everything lives in your own secure workspace</li>
            <li>✅ Full export anytime — no lock-in</li>
          </ul>

          <p>Under the hood, we've baked in:</p>
          <ul>
            <li>SSRF protection on every external call</li>
            <li>Command allowlisting for STDIO servers</li>
            <li>Strict RFC-compliant header validation</li>
            <li>OAuth-based integrations (no token leakage)</li>
          </ul>

          <p>First step:<br>
          <a href="${appUrl}/settings/security" class="button">🔒 Review your security settings</a></p>

          <p>🎁 <strong>We've added 3 vetted sample MCP servers to your workspace:</strong></p>
          <ul style="margin: 10px 0;">
            <li>Context7 (secure API docs) - requires API key from <a href="https://context7.com/dashboard">context7.com</a></li>
            <li>Whois (domain intel) - ready to use</li>
            <li>Test server - ready to use</li>
          </ul>
          <p style="margin: 15px 0;">📝 <strong>Quick Context7 setup:</strong><br>
          Go to <a href="${appUrl}/mcp-servers">MCP Servers</a> → Edit Context7 → Add API key to Headers</p>
          <p>🤖 <strong>Connect to Claude Desktop:</strong><br>
          Secure MCP proxy ready for your AI tools.<br>
          📚 Resources: <a href="https://plugged.in/setup-guide">Setup Guide</a> | <a href="https://docs.plugged.in">Documentation</a></p>

          <p>If you ever spot something we could improve, reply — security notes go straight to me.</p>

          <p>To building trust through transparency,<br>
          Cem 🐾<br>
          Founder @ Plugged.in</p>
          
          <div class="footer">
            <p>P.S. We're GDPR compliant and working on SOC2. Your data sovereignty matters.</p>
            <p><a href="${appUrl}/unsubscribe?token=${Buffer.from(email).toString('base64')}">Unsubscribe</a> |
            <a href="${appUrl}/settings">Email Preferences</a> |
            <a href="https://docs.plugged.in">Documentation</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  
  // Enterprise template
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>${styles}</style>
    </head>
    <body>
      <div class="container">
        <p>Dear ${firstName},</p>
        
        <p>Welcome to Plugged.in Enterprise. I'm Cem, the founder.</p>
        
        <p>Your organization now has access to:</p>
        <ul>
          <li>🏢 Multi-tenant workspace isolation</li>
          <li>🔐 Enterprise SSO integration</li>
          <li>📊 Team analytics & usage insights</li>
          <li>🛡️ Advanced security controls</li>
          <li>📞 Priority support channel</li>
        </ul>
        
        <p>Quick setup steps:</p>
        <ol>
          <li><a href="${appUrl}/admin/team">Invite your team members</a></li>
          <li><a href="${appUrl}/admin/permissions">Configure access permissions</a></li>
          <li><a href="${appUrl}/library">Upload your first documents</a></li>
          <li><a href="https://plugged.in/setup-guide">Review the MCP setup guide</a></li>
        </ol>

        <p>🎁 <strong>Pre-configured sample MCP servers:</strong><br>
        We've added Context7, Whois, and test servers to help your team get started immediately.<br>
        <em style="font-size: 0.95em;">Note: Context7 requires an API key from <a href="https://context7.com/dashboard">context7.com/dashboard</a>.<br>
        Configure in <a href="${appUrl}/mcp-servers">MCP Servers</a> → Edit → Headers.</em></p>

        <p>🤖 <strong>Enterprise AI Integration:</strong><br>
        Connect your team's Claude Desktop, Continue Dev, or custom MCP clients.<br>
        📚 Resources: <a href="https://plugged.in/setup-guide">Setup Guide</a> | <a href="https://docs.plugged.in">Documentation</a></p>
        
        <p>Your dedicated success manager will reach out within 24 hours to schedule your onboarding.</p>
        
        <p>Need immediate assistance?<br>
        Priority support: support+enterprise@plugged.in<br>
        Direct line: +31 20 123 4567</p>
        
        <p>Looking forward to partnering with your team,<br>
        Cem Karaca<br>
        Founder & CEO @ Plugged.in</p>
        
        <div class="footer">
          <p>VeriTeknik B.V. | Amsterdam, Netherlands | Enterprise Support Available 24/7</p>
          <p><a href="${appUrl}/unsubscribe?token=${Buffer.from(email).toString('base64')}">Unsubscribe</a> |
          <a href="${appUrl}/settings">Email Preferences</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate Day 3 follow-up email HTML
 */
function generateDay3Html(name: string, email: string, metrics: UserMetrics, _segment: UserSegment): string {
  const firstName = name.split(' ')[0];
  const appUrl = process.env.NEXTAUTH_URL || 'https://app.plugged.in';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        a { color: #4F46E5; text-decoration: none; }
        .footer { color: #666; font-size: 0.9em; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <p>${firstName}, quick check-in from Cem 👋</p>
        
        <p>You've been with us 3 days. How's it going?</p>
        
        <p>📊 Your workspace so far:<br>
        • Documents: ${metrics.documentCount}<br>
        • AI queries: ${metrics.queryCount}<br>
        • Knowledge items: ${metrics.knowledgeItems}</p>
        
        <p>All of this? 100% yours. Export it, delete it, or keep building — your call.</p>
        
        <p>If you're stuck or curious about something, just reply.<br>
        I'm usually debugging something anyway. 🐱</p>
        
        <p>Keep shipping,<br>
        Cem 🐾</p>
        
        <div class="footer">
          <p><a href="${appUrl}/unsubscribe?token=${Buffer.from(email).toString('base64')}">Unsubscribe</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate Day 7 follow-up email HTML (Active users)
 */
function generateDay7ActiveHtml(name: string, email: string, metrics: UserMetrics): string {
  const firstName = name.split(' ')[0];
  const appUrl = process.env.NEXTAUTH_URL || 'https://app.plugged.in';
  const timeSaved = Math.round(metrics.queryCount * 0.5); // Estimate 30 min saved per query
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        a { color: #4F46E5; text-decoration: none; }
        .footer { color: #666; font-size: 0.9em; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <p>${firstName},</p>
        
        <p>It's been a week! You're making great progress:</p>
        <p>✅ ${metrics.documentCount} documents uploaded<br>
        ✅ ${metrics.queryCount} AI queries processed<br>
        ✅ Approximately ${timeSaved} hours saved</p>
        
        <p>Hidden gems to explore next:</p>
        
        <ol>
          <li>🔄 <strong>Sequential Thinking</strong><br>
          My favorite feature. Breaks down complex problems step-by-step.<br>
          <a href="${appUrl}/sequential">Try it here</a></li>
          
          <li>🔔 <strong>Smart Notifications</strong><br>
          Get alerts when AI tasks complete.<br>
          <a href="${appUrl}/settings/notifications">Configure alerts</a></li>
          
          <li>🌐 <strong>MCP Marketplace</strong><br>
          50+ integrations, all secure.<br>
          <a href="${appUrl}/discover">Browse integrations</a></li>
        </ol>
        
        <p>Join our community:<br>
        💬 <a href="https://discord.gg/pluggedin">Discord</a> — I'm active daily<br>
        🐙 <a href="https://github.com/VeriTeknik">GitHub</a> — see what we're building</p>
        
        <p>Thanks for trusting us with your AI workspace,<br>
        Cem 🐾</p>
        
        <div class="footer">
          <p><a href="${appUrl}/unsubscribe?token=${Buffer.from(email).toString('base64')}">Unsubscribe</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate Day 7 follow-up email HTML (Inactive users)
 */
function generateDay7InactiveHtml(name: string, email: string): string {
  const firstName = name.split(' ')[0];
  const appUrl = process.env.NEXTAUTH_URL || 'https://app.plugged.in';
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        a { color: #4F46E5; text-decoration: none; }
        .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white !important; border-radius: 6px; text-decoration: none !important; margin: 16px 0; }
        .footer { color: #666; font-size: 0.9em; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; }
      </style>
    </head>
    <body>
      <div class="container">
        <p>Hi ${firstName}, Cem here 👋</p>
        
        <p>I noticed you signed up but haven't had a chance to dive in yet.<br>
        Totally get it — we're all swamped!</p>
        
        <p>Can I make this super easy?</p>
        
        <p>Option 1: Quick start (2 minutes)<br>
        <a href="${appUrl}/library" class="button">📄 Upload your first document</a><br>
        <em style="font-size: 0.9em;">Your docs become searchable in Claude Desktop via MCP tools!</em></p>
        
        <p>Option 2: Let me help (15 minutes)<br>
        <a href="https://calendly.com/cem-pluggedin/onboarding">📅 Book a quick call</a></p>
        
        <p>Option 3: Just reply<br>
        Tell me what you're trying to accomplish, and I'll point you in the right direction.</p>
        
        <p>No pressure — here whenever you're ready!</p>
        
        <p>Cem 🐾</p>
        
        <div class="footer">
          <p>P.S. If Plugged.in isn't what you need right now, no worries at all.<br>
          Just let me know — always appreciate the feedback!</p>
          <p><a href="${appUrl}/unsubscribe?token=${Buffer.from(email).toString('base64')}">Unsubscribe</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Send welcome email to new user
 */
export async function sendWelcomeEmail(options: WelcomeEmailOptions & { userId?: string }): Promise<boolean> {
  const { email, signupSource, userId } = options;
  
  // Check if welcome emails are enabled
  if (process.env.ENABLE_WELCOME_EMAILS === 'false') {
    console.log('Welcome emails are disabled');
    return false;
  }
  
  // Determine user segment
  const segment = options.segment || determineUserSegment(email, signupSource);
  
  // Get subject line (could implement A/B testing here)
  // Use crypto.randomInt for secure random selection
  const abVariant = crypto.randomInt(2) === 0 ? 'A' : 'B';
  const subject = getWelcomeSubject(segment, abVariant as 'A' | 'B');
  
  // Generate HTML content
  const html = generateWelcomeHtml({ ...options, segment });
  
  try {
    const result = await sendEmail({
      to: email,
      subject,
      html,
      from: process.env.EMAIL_FROM || 'noreply@plugged.in',
      fromName: 'Cem from Plugged.in',
      replyTo: process.env.EMAIL_REPLY_TO || 'cem@plugged.in',
    });
    
    if (result) {
      console.log(`Welcome email sent successfully to ${email} (segment: ${segment})`);

      // Track email sending in database if userId is provided
      if (userId) {
        try {
          await db.insert(emailTrackingTable).values({
            userId,
            emailType: 'welcome',
            segment,
            variant: abVariant,
            subject,
            metadata: {
              signupSource,
            },
          });
        } catch (trackingError) {
          console.error('Failed to track welcome email:', trackingError);
          // Don't fail the whole operation if tracking fails
        }
      }
    }

    // Always schedule follow-up emails if userId is provided
    // This ensures users get follow-up emails even if the welcome email fails
    console.log(`[sendWelcomeEmail] Checking if userId is provided for scheduling: userId=${userId}`);
    if (userId) {
      console.log(`[sendWelcomeEmail] userId is provided, attempting to schedule follow-up emails`);
      try {
        await scheduleFollowUpEmails(userId, email, segment);
        console.log(`[sendWelcomeEmail] Follow-up emails scheduled successfully for user ${userId} (${email})`);
      } catch (schedulingError) {
        console.error(`[sendWelcomeEmail] CRITICAL: Failed to schedule follow-up emails for user ${userId}:`, schedulingError);
        // Log this critical error but don't fail the welcome email operation
      }
    } else {
      console.log(`[sendWelcomeEmail] WARNING: userId not provided, skipping follow-up email scheduling`);
    }
    
    return result;
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    return false;
  }
}

/**
 * Schedule follow-up emails
 */
export async function scheduleFollowUpEmails(userId: string, email: string, segment: UserSegment) {
  console.log(`[scheduleFollowUpEmails] Starting to schedule for user ${userId}, email: ${email}, segment: ${segment}`);

  try {
    // Schedule Day 3 follow-up
    const day3Date = new Date();
    day3Date.setDate(day3Date.getDate() + 3);

    console.log(`[scheduleFollowUpEmails] Attempting to insert Day 3 email:`, {
      userId,
      emailType: 'day3',
      scheduledFor: day3Date,
      metadata: { segment, email },
    });

    const day3Result = await db.insert(scheduledEmailsTable).values({
      userId,
      emailType: 'day3',
      scheduledFor: day3Date,
      metadata: {
        segment,
        email,
      },
    }).returning();

    console.log(`[scheduleFollowUpEmails] Day 3 email inserted successfully:`, day3Result);

    // Schedule Day 7 follow-up
    const day7Date = new Date();
    day7Date.setDate(day7Date.getDate() + 7);

    console.log(`[scheduleFollowUpEmails] Attempting to insert Day 7 email:`, {
      userId,
      emailType: 'day7',
      scheduledFor: day7Date,
      metadata: { segment, email },
    });

    const day7Result = await db.insert(scheduledEmailsTable).values({
      userId,
      emailType: 'day7',
      scheduledFor: day7Date,
      metadata: {
        segment,
        email,
      },
    }).returning();

    console.log(`[scheduleFollowUpEmails] Day 7 email inserted successfully:`, day7Result);

    console.log(`[scheduleFollowUpEmails] SUCCESS - Follow-up emails scheduled for user ${userId}:`, {
      day3: day3Date,
      day7: day7Date,
      segment,
    });
  } catch (error) {
    console.error('[scheduleFollowUpEmails] ERROR - Failed to schedule follow-up emails:', error);
    console.error('[scheduleFollowUpEmails] Error details:', {
      userId,
      email,
      segment,
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : 'No stack',
    });
    throw error; // Re-throw to be caught by the caller
  }
}

/**
 * Get user metrics for email personalization
 */
export async function getUserMetrics(userId: string): Promise<UserMetrics> {
  try {
    // Get document count
    const docsResult = await db.query.docsTable.findMany({
      where: (docs, { eq }) => eq(docs.user_id, userId),
    });
    
    // For now, return placeholder metrics
    // In production, you'd query actual metrics from your analytics tables
    return {
      documentCount: docsResult.length,
      queryCount: 0, // Would come from query logs
      knowledgeItems: docsResult.length,
      lastActive: new Date(),
    };
  } catch (error) {
    console.error('Failed to get user metrics:', error);
    return {
      documentCount: 0,
      queryCount: 0,
      knowledgeItems: 0,
    };
  }
}

/**
 * Send Day 3 follow-up email
 */
export async function sendDay3Email(userId: string, email: string, name: string, segment: UserSegment): Promise<boolean> {
  try {
    const metrics = await getUserMetrics(userId);
    const html = generateDay3Html(name, email, metrics, segment);
    
    const result = await sendEmail({
      to: email,
      subject: 'Your Plugged.in workspace update',
      html,
      from: process.env.EMAIL_FROM || 'noreply@plugged.in',
      fromName: 'Cem from Plugged.in',
      replyTo: process.env.EMAIL_REPLY_TO || 'cem@plugged.in',
    });
    
    if (result) {
      // Track email
      await db.insert(emailTrackingTable).values({
        userId,
        emailType: 'day3',
        segment,
        subject: 'Your Plugged.in workspace update',
        metadata: { metrics },
      });
    }
    
    return result;
  } catch (error) {
    console.error('Failed to send Day 3 email:', error);
    return false;
  }
}

/**
 * Send Day 7 follow-up email
 */
export async function sendDay7Email(userId: string, email: string, name: string, segment: UserSegment): Promise<boolean> {
  try {
    const metrics = await getUserMetrics(userId);
    const isActive = metrics.documentCount > 0 || metrics.queryCount > 0;
    
    const subject = isActive 
      ? "You've been with us a week — here's what's next"
      : 'Need a hand getting started?';
    
    const html = isActive
      ? generateDay7ActiveHtml(name, email, metrics)
      : generateDay7InactiveHtml(name, email);
    
    const result = await sendEmail({
      to: email,
      subject,
      html,
      from: process.env.EMAIL_FROM || 'noreply@plugged.in',
      fromName: 'Cem from Plugged.in',
      replyTo: process.env.EMAIL_REPLY_TO || 'cem@plugged.in',
    });
    
    if (result) {
      // Track email
      await db.insert(emailTrackingTable).values({
        userId,
        emailType: 'day7',
        segment,
        variant: isActive ? 'active' : 'inactive',
        subject,
        metadata: { metrics, isActive },
      });
    }
    
    return result;
  } catch (error) {
    console.error('Failed to send Day 7 email:', error);
    return false;
  }
}

/**
 * Process scheduled emails (to be called by a cron job)
 */
export async function processScheduledEmails(): Promise<void> {
  try {
    // Find all emails that should be sent
    const now = new Date();
    const scheduledEmails = await db.query.scheduledEmailsTable.findMany({
      where: (scheduled, { and, eq, lte }) => 
        and(
          eq(scheduled.sent, false),
          eq(scheduled.cancelled, false),
          lte(scheduled.scheduledFor, now)
        ),
    });
    
    console.log(`Processing ${scheduledEmails.length} scheduled emails`);
    
    for (const scheduled of scheduledEmails) {
      try {
        // Get user details
        const user = await db.query.users.findFirst({
          where: eq(users.id, scheduled.userId),
        });
        
        if (!user) {
          console.log(`User not found for scheduled email ${scheduled.id}`);
          continue;
        }
        
        const metadata = scheduled.metadata as { email?: string; segment?: UserSegment } || {};
        const email = metadata.email || user.email;
        const segment = metadata.segment || 'general' as UserSegment;
        const name = user.name || 'Friend';
        
        let sent = false;
        
        // Send the appropriate email based on type
        if (scheduled.emailType === 'day3') {
          sent = await sendDay3Email(scheduled.userId, email, name, segment);
        } else if (scheduled.emailType === 'day7') {
          sent = await sendDay7Email(scheduled.userId, email, name, segment);
        }
        
        // Mark as sent
        if (sent) {
          await db.update(scheduledEmailsTable)
            .set({ 
              sent: true, 
              sentAt: new Date() 
            })
            .where(eq(scheduledEmailsTable.id, scheduled.id));
        }
      } catch (error) {
        console.error(`Failed to process scheduled email ${scheduled.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Failed to process scheduled emails:', error);
  }
}