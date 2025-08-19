import { BaseIntegrationService } from '../base-service';
import { IntegrationAction, IntegrationResult,SlackIntegration } from '../types';

interface SlackMessage {
  text: string;
  channel?: string;
  attachments?: Array<{
    fallback: string;
    color?: string;
    title?: string;
    title_link?: string;
    text?: string;
    fields?: Array<{
      title: string;
      value: string;
      short?: boolean;
    }>;
    footer?: string;
    ts?: number;
  }>;
  blocks?: Array<any>;
  thread_ts?: string;
  reply_broadcast?: boolean;
}

export class SlackService extends BaseIntegrationService {
  private slackIntegration: SlackIntegration;

  constructor(integration: SlackIntegration) {
    super(integration);
    this.slackIntegration = integration;
  }

  async execute(action: IntegrationAction): Promise<IntegrationResult> {
    console.log('SlackService.execute called with action type:', action.type);
    console.log('SlackService is enabled:', this.isEnabled());
    console.log('SlackService webhook URL:', this.slackIntegration.config?.webhookUrl ? 'Present' : 'Missing');
    console.log('[SlackService] Webhook URL length:', this.slackIntegration.config?.webhookUrl?.length);
    console.log('[SlackService] Config channel:', this.slackIntegration.config?.channel);
    
    try {
      if (!await this.checkRateLimit()) {
        return {
          success: false,
          error: 'Rate limit exceeded',
        };
      }

      let result: IntegrationResult;

      switch (action.type) {
        case 'send_slack':
        case 'notify_team':
          console.log('Calling sendMessage with payload:', action.payload);
          result = await this.sendMessage(action.payload);
          break;
        case 'send_direct_message':
          result = await this.sendDirectMessage(action.payload);
          break;
        case 'create_channel':
          result = await this.createChannel(action.payload);
          break;
        case 'upload_file':
          result = await this.uploadFile(action.payload);
          break;
        case 'add_reaction':
          result = await this.addReaction(action.payload);
          break;
        case 'get_user_info':
          result = await this.getUserInfo(action.payload);
          break;
        default:
          result = {
            success: false,
            error: `Unsupported action type: ${action.type}`,
          };
      }

      await this.logAction(action, result);
      return result;
    } catch (error) {
      return await this.handleError(error);
    }
  }

  async validate(): Promise<boolean> {
    try {
      const config = this.slackIntegration.config;
      
      // Check if we have webhook URL or bot token
      if (!config.webhookUrl && !config.botToken) {
        return false;
      }

      // Test the connection
      const testResult = await this.test();
      return testResult.success;
    } catch (error) {
      console.error('Slack validation error:', error);
      return false;
    }
  }

  async test(): Promise<IntegrationResult> {
    try {
      const config = this.slackIntegration.config;
      
      console.log('[SlackService.test] Starting test with config:', {
        hasWebhookUrl: !!config.webhookUrl,
        webhookUrlLength: config.webhookUrl?.length,
        hasBotToken: !!config.botToken,
        hasChannel: !!config.channel,
        channel: config.channel
      });

      if (config.botToken) {
        // Test with bot token by checking auth
        const response = await this.makeApiCall('auth.test');
        
        if (response.ok) {
          const data = await response.json();
          if (data.ok) {
            return {
              success: true,
              data: {
                message: 'Slack connection successful',
                team: data.team,
                user: data.user,
              },
            };
          } else {
            return {
              success: false,
              error: `Slack API error: ${data.error || 'Unknown error'}`,
            };
          }
        } else {
          return {
            success: false,
            error: `Slack API request failed: ${response.status} ${response.statusText}`,
          };
        }
      } else if (config.webhookUrl) {
        // Validate webhook URL format
        if (!config.webhookUrl.startsWith('https://hooks.slack.com/')) {
          return {
            success: false,
            error: 'Invalid webhook URL format. Must start with https://hooks.slack.com/',
          };
        }
        
        console.log('[SlackService.test] Testing webhook URL (masked):', 
          config.webhookUrl.substring(0, 40) + '...');
        
        // Test webhook by sending a test message with timestamp
        const testMessage = {
          text: `🔧 Connection test from Plugged.in\nTimestamp: ${new Date().toISOString()}\nChannel: ${config.channel || 'Not specified'}`,
        };
        
        console.log('[SlackService.test] Sending test message:', testMessage);
        
        const response = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testMessage),
        });
        
        // Read response body
        const responseText = await response.text();
        console.log('[SlackService.test] Response:', {
          status: response.status,
          statusText: response.statusText,
          body: responseText,
          ok: response.ok
        });

        // Check both status and response body
        if (response.ok && responseText.toLowerCase().trim() === 'ok') {
          return {
            success: true,
            data: { 
              message: `Slack webhook returned OK. Test message sent with timestamp: ${new Date().toISOString()}. Please check your Slack channel to confirm delivery.`,
              channel: config.channel || 'Default channel',
              warning: 'Note: Slack may return OK even for expired webhooks. If you don\'t see the test message, please generate a new webhook URL.'
            },
          };
        } else if (response.status === 404 && responseText.includes('no_team')) {
          return {
            success: false,
            error: 'Invalid webhook URL: Team not found. Please check your webhook URL.',
          };
        } else if (response.status === 404 && responseText.includes('no_service')) {
          return {
            success: false,
            error: 'Invalid webhook URL: Service not found. The webhook may have been deleted.',
          };
        } else if (!response.ok) {
          return {
            success: false,
            error: `Webhook test failed: HTTP ${response.status} - ${responseText}`,
          };
        } else {
          return {
            success: false,
            error: `Unexpected response from Slack: ${responseText}`,
          };
        }
      } else {
        return {
          success: false,
          error: 'No Slack configuration found. Please provide either a webhook URL or bot token.',
        };
      }
    } catch (error) {
      console.error('[SlackService.test] Error during test:', error);
      return await this.handleError(error);
    }
  }

  private async sendMessage(payload: any): Promise<IntegrationResult> {
    console.log('sendMessage called with payload:', payload);
    
    try {
      const config = this.slackIntegration.config;
      console.log('Config available:', !!config, 'Has webhook:', !!config?.webhookUrl, 'Has bot token:', !!config?.botToken);
      
      const { text, channel, attachments, blocks, thread_ts, senderInfo } = payload;
      console.log('Extracted from payload - text:', text, 'channel:', channel);

      // Build message with optional identity using Block Kit context block
      let finalBlocks: any[] | undefined = blocks ? [...blocks] : undefined;
      if (senderInfo?.name || senderInfo?.email) {
        const label = senderInfo.email
          ? `${senderInfo.name || 'User'} <${senderInfo.email}>`
          : senderInfo.name;
        const contextBlock = {
          type: 'context',
          elements: [
            senderInfo.avatar
              ? { type: 'image', image_url: senderInfo.avatar, alt_text: 'avatar' }
              : undefined,
            { type: 'mrkdwn', text: `Sent by ${label}` },
          ].filter(Boolean),
        } as any;
        finalBlocks = finalBlocks ? [contextBlock, ...finalBlocks] : [contextBlock, { type: 'section', text: { type: 'mrkdwn', text } }];
      }

      const message: SlackMessage = {
        text,
        channel: channel || config.channel,
        attachments,
        blocks: finalBlocks,
        thread_ts,
      };

      // Use bot token if available, otherwise use webhook
      if (config.botToken) {
        const response = await this.makeApiCall('chat.postMessage', message);
        
        if (response.ok) {
          const data = await response.json();
          if (data.ok) {
            return {
              success: true,
              data: {
                message: 'Message sent successfully',
                ts: data.ts,
                channel: data.channel,
              },
            };
          } else {
            return {
              success: false,
              error: data.error || 'Failed to send message',
            };
          }
        }
      } else if (config.webhookUrl) {
        if (channel && channel !== config.channel) {
          console.warn('[SlackService] Channel override requested for webhook delivery. Incoming webhooks ignore the channel field unless configured in Slack. Using webhook default channel:', config.channel);
        }
        
        // For webhooks, simplify the message to just text
        // Webhooks don't always handle blocks well
        const webhookMessage = {
          text: message.text,
          // Only include channel if it's set (though webhooks ignore it)
          ...(message.channel && { channel: message.channel })
        };
        
        console.log('[SlackService] Sending to webhook:', JSON.stringify(webhookMessage, null, 2));
        
        const response = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookMessage),
        });

        const respText = await response.text().catch(() => '');
        console.log('[SlackService.sendMessage] Webhook response:', {
          status: response.status,
          statusText: response.statusText,
          body: respText,
          ok: response.ok
        });
        
        if (response.ok && respText.trim().toLowerCase() === 'ok') {
          return {
            success: true,
            data: { message: 'Message sent via webhook', response: respText },
          };
        } else if (response.status === 404 && respText.includes('no_team')) {
          return {
            success: false,
            error: 'Invalid webhook URL: Team not found. Please update your webhook URL.',
          };
        } else if (response.status === 404 && respText.includes('no_service')) {
          return {
            success: false,
            error: 'Invalid webhook URL: Service not found. The webhook may have been deleted.',
          };
        }
        return {
          success: false,
          error: `Slack webhook error: HTTP ${response.status} ${response.statusText}${respText ? ' - ' + respText : ''}`,
        };
      }

      return {
        success: false,
        error: 'No valid Slack configuration found',
      };
    } catch (error) {
      return await this.handleError(error);
    }
  }

  private async sendDirectMessage(payload: any): Promise<IntegrationResult> {
    try {
      const config = this.slackIntegration.config;
      
      if (!config.botToken) {
        return {
          success: false,
          error: 'Bot token required for direct messages',
        };
      }

      const { userId, text, blocks } = payload;

      // First, open a conversation with the user
      const convResponse = await this.makeApiCall('conversations.open', {
        users: userId,
      });

      if (!convResponse.ok) {
        return {
          success: false,
          error: 'Failed to open conversation',
        };
      }

      const convData = await convResponse.json();
      if (!convData.ok) {
        return {
          success: false,
          error: convData.error || 'Failed to open conversation',
        };
      }

      // Send the message
      const message: SlackMessage = {
        text,
        channel: convData.channel.id,
        blocks,
      };

      return await this.sendMessage(message);
    } catch (error) {
      return await this.handleError(error);
    }
  }

  private async createChannel(payload: any): Promise<IntegrationResult> {
    try {
      const config = this.slackIntegration.config;
      
      if (!config.botToken) {
        return {
          success: false,
          error: 'Bot token required for creating channels',
        };
      }

      const { name, isPrivate = false, description } = payload;

      const response = await this.makeApiCall('conversations.create', {
        name,
        is_private: isPrivate,
        description,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          return {
            success: true,
            data: {
              message: 'Channel created successfully',
              channel: data.channel,
            },
          };
        } else {
          return {
            success: false,
            error: data.error || 'Failed to create channel',
          };
        }
      }

      return {
        success: false,
        error: 'Failed to create channel',
      };
    } catch (error) {
      return await this.handleError(error);
    }
  }

  private async uploadFile(payload: any): Promise<IntegrationResult> {
    try {
      const config = this.slackIntegration.config;
      
      if (!config.botToken) {
        return {
          success: false,
          error: 'Bot token required for file uploads',
        };
      }

      const { content, filename, channels, title, initialComment } = payload;

      const response = await this.makeApiCall('files.upload', {
        content,
        filename,
        channels: channels || config.channel,
        title,
        initial_comment: initialComment,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          return {
            success: true,
            data: {
              message: 'File uploaded successfully',
              file: data.file,
            },
          };
        } else {
          return {
            success: false,
            error: data.error || 'Failed to upload file',
          };
        }
      }

      return {
        success: false,
        error: 'Failed to upload file',
      };
    } catch (error) {
      return await this.handleError(error);
    }
  }

  private async addReaction(payload: any): Promise<IntegrationResult> {
    try {
      const config = this.slackIntegration.config;
      
      if (!config.botToken) {
        return {
          success: false,
          error: 'Bot token required for adding reactions',
        };
      }

      const { channel, timestamp, name } = payload;

      const response = await this.makeApiCall('reactions.add', {
        channel,
        timestamp,
        name,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          return {
            success: true,
            data: { message: 'Reaction added successfully' },
          };
        } else {
          return {
            success: false,
            error: data.error || 'Failed to add reaction',
          };
        }
      }

      return {
        success: false,
        error: 'Failed to add reaction',
      };
    } catch (error) {
      return await this.handleError(error);
    }
  }

  private async getUserInfo(payload: any): Promise<IntegrationResult> {
    try {
      const config = this.slackIntegration.config;
      
      if (!config.botToken) {
        return {
          success: false,
          error: 'Bot token required for getting user info',
        };
      }

      const { userId } = payload;

      const response = await this.makeApiCall('users.info', {
        user: userId,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          return {
            success: true,
            data: {
              user: data.user,
            },
          };
        } else {
          return {
            success: false,
            error: data.error || 'Failed to get user info',
          };
        }
      }

      return {
        success: false,
        error: 'Failed to get user info',
      };
    } catch (error) {
      return await this.handleError(error);
    }
  }

  private async makeApiCall(method: string, params?: any): Promise<Response> {
    const config = this.slackIntegration.config;
    
    if (!config.botToken) {
      throw new Error('Bot token not configured');
    }

    const url = `https://slack.com/api/${method}`;
    
    return fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
  }

  // Helper method to format messages with rich content
  static formatRichMessage(
    text: string,
    options?: {
      color?: string;
      title?: string;
      fields?: Array<{ title: string; value: string; short?: boolean }>;
      footer?: string;
      imageUrl?: string;
      authorName?: string;
      authorIcon?: string;
    }
  ): SlackMessage {
    const message: SlackMessage = {
      text,
      attachments: [],
    };

    if (options) {
      const attachment: any = {
        fallback: text,
        color: options.color || 'good',
        text,
      };

      if (options.title) attachment.title = options.title;
      if (options.fields) attachment.fields = options.fields;
      if (options.footer) attachment.footer = options.footer;
      if (options.imageUrl) attachment.image_url = options.imageUrl;
      if (options.authorName) {
        attachment.author_name = options.authorName;
        if (options.authorIcon) attachment.author_icon = options.authorIcon;
      }

      attachment.ts = Math.floor(Date.now() / 1000);
      message.attachments!.push(attachment);
    }

    return message;
  }

  // Helper method to create Block Kit messages
  static createBlockMessage(blocks: Array<any>): SlackMessage {
    return {
      text: 'Message from Plugged.in',
      blocks,
    };
  }
}