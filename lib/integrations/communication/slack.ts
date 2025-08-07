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
          }
        }
      } else if (config.webhookUrl) {
        // Test webhook by sending a test message
        const response = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: 'Connection test from Plugged.in',
          }),
        });

        if (response.ok) {
          return {
            success: true,
            data: { message: 'Slack webhook connection successful' },
          };
        }
      }

      return {
        success: false,
        error: 'Failed to connect to Slack',
      };
    } catch (error) {
      return await this.handleError(error);
    }
  }

  private async sendMessage(payload: any): Promise<IntegrationResult> {
    try {
      const config = this.slackIntegration.config;
      const { text, channel, attachments, blocks, thread_ts } = payload;

      const message: SlackMessage = {
        text,
        channel: channel || config.channel,
        attachments,
        blocks,
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
        const response = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });

        if (response.ok) {
          return {
            success: true,
            data: { message: 'Message sent via webhook' },
          };
        }
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