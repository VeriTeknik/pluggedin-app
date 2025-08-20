import nodemailer from 'nodemailer';

import { getUserInfoFromAuth } from '@/lib/auth';

import { BaseIntegrationService } from '../base-service';
import { EmailIntegration, IntegrationAction, IntegrationResult } from '../types';

export class EmailService extends BaseIntegrationService {
  private transporter: nodemailer.Transporter | null = null;

  constructor(integration: EmailIntegration) {
    super(integration);
  }

  async initialize(): Promise<void> {
    // Create transporter using system email configuration from environment variables
    const transporterConfig = {
      host: process.env.EMAIL_SERVER_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_SERVER_PORT || '587'),
      secure: process.env.EMAIL_SERVER_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_SERVER_USER,
        pass: process.env.EMAIL_SERVER_PASSWORD,
      },
    };

    this.transporter = nodemailer.createTransport(transporterConfig);
  }

  async execute(action: IntegrationAction): Promise<IntegrationResult> {
    if (!this.transporter) {
      await this.initialize();
    }

    if (!this.transporter) {
      return this.handleError(new Error('Email transporter not initialized'));
    }

    try {
      switch (action.type) {
        case 'send_email':
          return await this.sendEmail(action.payload);
        default:
          return this.handleError(new Error(`Unsupported action type: ${action.type}`));
      }
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async sendEmail(data: any): Promise<IntegrationResult> {
    if (!this.transporter) {
      return this.handleError(new Error('Email transporter not initialized'));
    }

    try {
      // Get user info from authentication context
      const userInfo = await getUserInfoFromAuth();
      const fromName = process.env.EMAIL_FROM_NAME || 'Plugged.in';
      const fromEmail = process.env.EMAIL_FROM || 'noreply@plugged.in';

      // Create email content with user/persona information
      const emailContent = this.createEmailContent(data, userInfo);

      const mailOptions = {
        from: `${fromName} <${fromEmail}>`,
        to: data.to,
        subject: data.subject || 'Message from Plugged.in',
        html: emailContent.html,
        text: emailContent.text,
      };

      const result = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        data: {
          messageId: result.messageId,
          response: result.response,
        },
        metadata: {
          provider: this.integration.provider,
          timestamp: new Date().toISOString(),
          senderInfo: userInfo ? {
            name: userInfo.name || userInfo.username,
            email: userInfo.email,
          } : null,
        },
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  private createEmailContent(data: any, userInfo: any): { html: string; text: string } {
    const senderName = userInfo?.name || userInfo?.username || 'Plugged.in Assistant';
    const senderEmail = userInfo?.email || '';
    const personaName = data.personaName || 'AI Assistant';
    
    // Create HTML email with beautiful template
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${data.subject || 'Message from Plugged.in'}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f5f5;
          }
          
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
          }
          
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 30px 20px;
            text-align: center;
            color: white;
          }
          
          .logo {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
          }
          
          .sender-info {
            background-color: #f8f9fa;
            padding: 20px;
            border-bottom: 1px solid #e9ecef;
          }
          
          .sender-details {
            display: flex;
            align-items: center;
            gap: 15px;
          }
          
          .avatar {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 18px;
          }
          
          .sender-text h3 {
            color: #333;
            margin-bottom: 5px;
          }
          
          .sender-text p {
            color: #666;
            font-size: 14px;
          }
          
          .content {
            padding: 30px 20px;
          }
          
          .message {
            margin-bottom: 30px;
          }
          
          .message h2 {
            color: #333;
            margin-bottom: 15px;
            font-size: 20px;
          }
          
          .message-body {
            color: #555;
            line-height: 1.8;
            white-space: pre-wrap;
          }
          
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            border-top: 1px solid #e9ecef;
          }
          
          .footer p {
            color: #666;
            font-size: 14px;
            margin-bottom: 10px;
          }
          
          .social-links {
            margin-top: 15px;
          }
          
          .social-links a {
            margin: 0 10px;
            color: #667eea;
            text-decoration: none;
          }
          
          .unsubscribe {
            margin-top: 15px;
            font-size: 12px;
            color: #999;
          }
          
          .unsubscribe a {
            color: #999;
            text-decoration: underline;
          }
          
          @media (max-width: 480px) {
            .sender-details {
              flex-direction: column;
              text-align: center;
            }
            
            .avatar {
              margin: 0 auto;
            }
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <div class="logo">Plugged.in</div>
            <p>AI-Powered Communication Platform</p>
          </div>
          
          <div class="sender-info">
            <div class="sender-details">
              <div class="avatar">
                ${senderName.charAt(0).toUpperCase()}
              </div>
              <div class="sender-text">
                <h3>${senderName}</h3>
                <p>${personaName} • ${senderEmail}</p>
              </div>
            </div>
          </div>
          
          <div class="content">
            <div class="message">
              <h2>${data.subject || 'Message from Plugged.in'}</h2>
              <div class="message-body">
                ${data.message || data.body || ''}
              </div>
            </div>
          </div>
          
          <div class="footer">
            <p>Powered by Plugged.in - AI-Powered Communication Platform</p>
            <div class="social-links">
              <a href="https://twitter.com/pluggedin">Twitter</a>
              <a href="https://linkedin.com/company/pluggedin">LinkedIn</a>
              <a href="https://github.com/pluggedin">GitHub</a>
            </div>
            <div class="unsubscribe">
              <p>This message was sent by ${senderName} using Plugged.in.</p>
              <p><a href="#">Unsubscribe</a></p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Create plain text version
    const text = `
Message from Plugged.in

From: ${senderName} (${senderEmail})
Persona: ${personaName}

Subject: ${data.subject || 'Message from Plugged.in'}

${data.message || data.body || ''}

---
Powered by Plugged.in - AI-Powered Communication Platform
`;

    return { html, text };
  }

  async validate(): Promise<boolean> {
    try {
      if (!this.transporter) {
        await this.initialize();
      }

      if (!this.transporter) {
        return false;
      }

      // Verify transporter configuration
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email validation error:', error);
      return false;
    }
  }

  async test(): Promise<IntegrationResult> {
    try {
      const isValid = await this.validate();
      
      if (!isValid) {
        return {
          success: false,
          error: 'Email configuration is invalid',
        };
      }

      // Send a test email to the authenticated user
      const userInfo = await getUserInfoFromAuth();
      if (!userInfo?.email) {
        return {
          success: false,
          error: 'No user email found for testing',
        };
      }

      const testResult = await this.sendEmail({
        to: userInfo.email,
        subject: 'Test Email from Plugged.in',
        message: 'This is a test email to verify that your email integration is working correctly.',
        personaName: 'Test Assistant',
      });

      return testResult;
    } catch (error) {
      return this.handleError(error);
    }
  }
}