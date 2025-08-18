import { 
  BaseIntegration,
  IntegrationAction, 
  IntegrationResult, 
  PersonaCapability,
  PersonaIntegrations} from './types';

export abstract class BaseIntegrationService {
  protected integration: BaseIntegration;

  constructor(integration: BaseIntegration) {
    this.integration = integration;
  }

  abstract execute(action: IntegrationAction): Promise<IntegrationResult>;
  
  abstract validate(): Promise<boolean>;
  
  abstract test(): Promise<IntegrationResult>;

  isEnabled(): boolean {
    // If status is not set, default to checking if enabled is true
    // Status is optional and might not be set for all integrations
    return this.integration.enabled && (this.integration.status === 'active' || this.integration.status === undefined);
  }

  async handleError(error: any): Promise<IntegrationResult> {
    console.error(`Integration error [${this.integration.provider}]:`, error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown integration error',
      metadata: {
        provider: this.integration.provider,
        timestamp: new Date().toISOString(),
      }
    };
  }

  protected async checkRateLimit(): Promise<boolean> {
    // Implement rate limiting logic here
    // For now, return true
    return true;
  }

  protected async logAction(action: IntegrationAction, result: IntegrationResult): Promise<void> {
    // Log integration actions for debugging and auditing
    console.log('Integration action:', {
      provider: this.integration.provider,
      action: action.type,
      success: result.success,
      timestamp: new Date().toISOString(),
    });
  }
}

export class IntegrationManager {
  private integrations: Map<string, BaseIntegrationService>;
  private capabilities: PersonaCapability[] = [];
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor(
    private personaIntegrations: PersonaIntegrations,
    capabilities: PersonaCapability[] = [],
    private personaId?: number
  ) {
    // Ensure the Map is created properly
    this.integrations = new Map<string, BaseIntegrationService>();
    this.capabilities = capabilities;
    
    console.log('IntegrationManager constructor - integrations Map created:', this.integrations instanceof Map);
    console.log('IntegrationManager constructor - personaIntegrations:', JSON.stringify(personaIntegrations, null, 2));
    
    // Initialize asynchronously
    this.initPromise = this.initializeIntegrations().then(() => {
      this.initialized = true;
      console.log('IntegrationManager initialization complete, services:', Array.from(this.integrations.keys()));
    }).catch(error => {
      console.error('Failed to initialize integrations:', error);
      this.initialized = true; // Mark as initialized even on error to prevent hanging
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized && this.initPromise) {
      await this.initPromise;
    }
  }

  private async initializeIntegrations(): Promise<void> {
    try {
      // Initialize calendar integration
      console.log('[IntegrationManager] Checking calendar integration:', {
        hasCalendar: !!this.personaIntegrations.calendar,
        isEnabled: this.personaIntegrations.calendar?.enabled,
        provider: this.personaIntegrations.calendar?.provider
      });
      
      if (this.personaIntegrations.calendar?.enabled) {
        // Dynamic import to avoid circular dependency
        const { GoogleCalendarService } = await import('./calendar/google-calendar');
        const calendarIntegration = this.personaIntegrations.calendar;
        // Don't log sensitive tokens
        console.log('[IntegrationManager] Calendar integration being passed to service:', {
          enabled: calendarIntegration?.enabled,
          provider: calendarIntegration?.provider,
          hasConfig: !!calendarIntegration?.config,
          hasAccessToken: !!calendarIntegration?.config?.accessToken,
          hasRefreshToken: !!calendarIntegration?.config?.refreshToken
        });
        const calendarService = new GoogleCalendarService(calendarIntegration, this.personaId);
        this.registerService('calendar', calendarService);
        console.log('[IntegrationManager] Calendar integration initialized and registered');
        console.log('[IntegrationManager] Calendar service registered:', this.integrations.has('calendar'));
      } else {
        console.log('[IntegrationManager] Calendar integration NOT enabled or missing');
      }

      // Initialize communication integrations
      if (this.personaIntegrations.communication?.slack?.enabled) {
        // Dynamic import to avoid circular dependency
        const { SlackService } = await import('./communication/slack');
        const slackIntegration = this.personaIntegrations.communication.slack;
        const slackService = new SlackService(slackIntegration);
        this.registerService('slack', slackService);
        console.log('Slack integration initialized and registered');
        console.log('Slack service registered:', this.integrations.has('slack'));
      }

      if (this.personaIntegrations.communication?.email?.enabled) {
        // Dynamic import to avoid circular dependency
        const { EmailService } = await import('./communication/email');
        const emailIntegration = this.personaIntegrations.communication.email;
        const emailService = new EmailService(emailIntegration);
        this.registerService('email', emailService);
        console.log('Email integration initialized and registered');
        console.log('Email service registered:', this.integrations.has('email'));
      }

      // Initialize CRM integration
      if (this.personaIntegrations.crm?.enabled) {
        // Will be implemented with CRM service
        console.log('CRM integration initialized');
      }
      
      console.log('Total services registered:', this.integrations.size);
      console.log('Registered services:', Array.from(this.integrations.keys()));
    } catch (error) {
      console.error('Error initializing integrations:', error);
      throw error;
    }
  }

  async executeAction(action: IntegrationAction): Promise<IntegrationResult> {
    console.log('[IntegrationManager] ExecuteAction called with:', action.type);
    console.log('[IntegrationManager] Full action:', JSON.stringify(action, null, 2));
    
    // Ensure integrations are initialized
    await this.ensureInitialized();
    
    console.log('[IntegrationManager] Available services after init:', Array.from(this.integrations.keys()));
    console.log('[IntegrationManager] integrations Map size:', this.integrations.size);
    console.log('[IntegrationManager] personaIntegrations:', JSON.stringify({
      calendar: {
        enabled: this.personaIntegrations?.calendar?.enabled,
        provider: this.personaIntegrations?.calendar?.provider,
        hasConfig: !!this.personaIntegrations?.calendar?.config,
        hasAccessToken: !!this.personaIntegrations?.calendar?.config?.accessToken,
        hasRefreshToken: !!this.personaIntegrations?.calendar?.config?.refreshToken
      }
    }, null, 2));
    
    // Try to get service directly based on action type
    let service: BaseIntegrationService | undefined;
    
    // Map action types to service keys
    const actionToServiceMap: Record<string, string> = {
      'send_slack': 'slack',
      'send_email': 'email',
      'schedule_meeting': 'calendar',
      'check_availability': 'calendar',
      'cancel_meeting': 'calendar',
      'update_meeting': 'calendar',
      'create_lead': 'crm',
      'create_ticket': 'support'
    };
    
    const serviceKey = actionToServiceMap[action.type];
    console.log('Service key for action:', serviceKey);
    
    if (serviceKey) {
      service = this.integrations.get(serviceKey);
      console.log('Service found:', !!service);
    }
    
    // If no direct service found, try capability-based lookup
    if (!service) {
      const capability = this.capabilities.find(cap => cap.id === action.type);
      
      if (!capability || !capability.enabled) {
        return {
          success: false,
          error: `Capability ${action.type} is not enabled or configured`,
        };
      }

      // Get the appropriate service
      service = this.getServiceForCapability(capability) || undefined;
    }
    
    if (!service) {
      return {
        success: false,
        error: `No service available for action ${action.type}`,
      };
    }

    // Check if service is enabled
    const isServiceEnabled = service.isEnabled();
    console.log('Service enabled check:', isServiceEnabled);
    
    if (!isServiceEnabled) {
      return {
        success: false,
        error: `Service is not enabled for ${action.type}`,
      };
    }

    // Execute the action
    console.log('Executing action with service:', service.constructor.name);
    const result = await service.execute(action);
    console.log('Service execution result:', result);
    return result;
  }

  private getServiceForCapability(capability: PersonaCapability): BaseIntegrationService | null {
    // Map capability to service
    const serviceKey = this.getServiceKeyForCapability(capability);
    return serviceKey ? this.integrations.get(serviceKey) || null : null;
  }

  private getServiceKeyForCapability(capability: PersonaCapability): string | null {
    switch (capability.category) {
      case 'calendar':
        return 'calendar';
      case 'communication':
        if (capability.id.includes('slack')) return 'slack';
        if (capability.id.includes('email')) return 'email';
        break;
      case 'crm':
        return 'crm';
      case 'support':
        return 'support';
    }
    return null;
  }

  async testAllIntegrations(): Promise<Record<string, IntegrationResult>> {
    await this.ensureInitialized();
    const results: Record<string, IntegrationResult> = {};
    
    for (const [key, service] of this.integrations) {
      results[key] = await service.test();
    }
    
    return results;
  }

  getAvailableCapabilities(): PersonaCapability[] {
    return this.capabilities.filter(cap => {
      // Check if required integrations are available
      if (!cap.requiredIntegrations) return true;
      
      return cap.requiredIntegrations.every(req => {
        const parts = req.split('.');
        if (parts.length === 1) {
          // Top-level integration like 'calendar'
          return this.isIntegrationAvailable(parts[0]);
        } else {
          // Nested integration like 'communication.slack'
          return this.isNestedIntegrationAvailable(parts);
        }
      });
    });
  }

  private isIntegrationAvailable(key: string): boolean {
    switch (key) {
      case 'calendar':
        return !!this.personaIntegrations.calendar?.enabled;
      case 'crm':
        return !!this.personaIntegrations.crm?.enabled;
      case 'support':
        return !!this.personaIntegrations.support?.enabled;
      case 'communication':
        return !!(
          this.personaIntegrations.communication?.slack?.enabled ||
          this.personaIntegrations.communication?.email?.enabled ||
          this.personaIntegrations.communication?.discord?.enabled ||
          this.personaIntegrations.communication?.teams?.enabled
        );
      default:
        return false;
    }
  }

  private isNestedIntegrationAvailable(parts: string[]): boolean {
    if (parts[0] === 'communication' && parts[1]) {
      const comm = this.personaIntegrations.communication;
      switch (parts[1]) {
        case 'slack':
          return !!comm?.slack?.enabled;
        case 'email':
          return !!comm?.email?.enabled;
        case 'discord':
          return !!comm?.discord?.enabled;
        case 'teams':
          return !!comm?.teams?.enabled;
      }
    }
    return false;
  }

  registerService(key: string, service: BaseIntegrationService): void {
    this.integrations.set(key, service);
  }

  getService(key: string): BaseIntegrationService | undefined {
    return this.integrations.get(key);
  }
}