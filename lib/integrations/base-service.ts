import { 
  IntegrationAction, 
  IntegrationResult, 
  BaseIntegration,
  PersonaIntegrations,
  PersonaCapability
} from './types';

export abstract class BaseIntegrationService {
  protected integration: BaseIntegration;

  constructor(integration: BaseIntegration) {
    this.integration = integration;
  }

  abstract execute(action: IntegrationAction): Promise<IntegrationResult>;
  
  abstract validate(): Promise<boolean>;
  
  abstract test(): Promise<IntegrationResult>;

  isEnabled(): boolean {
    return this.integration.enabled && this.integration.status === 'active';
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
  private integrations: Map<string, BaseIntegrationService> = new Map();
  private capabilities: PersonaCapability[] = [];

  constructor(
    private personaIntegrations: PersonaIntegrations,
    capabilities: PersonaCapability[] = []
  ) {
    this.capabilities = capabilities;
    this.initializeIntegrations();
  }

  private initializeIntegrations(): void {
    // Initialize calendar integration
    if (this.personaIntegrations.calendar?.enabled) {
      // Will be implemented with specific calendar service
      console.log('Calendar integration initialized');
    }

    // Initialize communication integrations
    if (this.personaIntegrations.communication?.slack?.enabled) {
      // Will be implemented with Slack service
      console.log('Slack integration initialized');
    }

    if (this.personaIntegrations.communication?.email?.enabled) {
      // Will be implemented with email service
      console.log('Email integration initialized');
    }

    // Initialize CRM integration
    if (this.personaIntegrations.crm?.enabled) {
      // Will be implemented with CRM service
      console.log('CRM integration initialized');
    }
  }

  async executeAction(action: IntegrationAction): Promise<IntegrationResult> {
    // Find the appropriate integration based on action type
    const capability = this.capabilities.find(cap => cap.id === action.type);
    
    if (!capability || !capability.enabled) {
      return {
        success: false,
        error: `Capability ${action.type} is not enabled`,
      };
    }

    // Get the appropriate service
    const service = this.getServiceForCapability(capability);
    
    if (!service) {
      return {
        success: false,
        error: `No service available for capability ${action.type}`,
      };
    }

    // Check if service is enabled
    if (!service.isEnabled()) {
      return {
        success: false,
        error: `Service is not enabled for ${action.type}`,
      };
    }

    // Execute the action
    return await service.execute(action);
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