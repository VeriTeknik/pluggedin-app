// Notification metadata types for enhanced tracking

/**
 * Centralized allowed values for how a notification was completed.
 */
export type CompletedVia = 'web' | 'api' | 'mcp';

export interface NotificationMetadata {
  // Source tracking - who/what created the notification
  source?: {
    type: 'user' | 'system' | 'mcp' | 'api';
    userId?: string;        // User ID who created it
    profileUuid?: string;   // Which profile context
    mcpServer?: string;     // If from MCP, which server name
    mcpServerUuid?: string; // MCP server UUID
    apiKeyId?: string;      // If from API, which API key
    apiKeyName?: string;    // Human-readable API key name
  };
  
  // Action tracking - audit trail of state changes
  actions?: {
    markedReadBy?: string;      // User ID who marked as read
    markedReadAt?: string;      // ISO timestamp
    markedReadProfileUuid?: string; // Profile context when marked read
    completedBy?: string;       // User ID who marked as completed  
    completedAt?: string;       // ISO timestamp
    completedProfileUuid?: string; // Profile context when completed
    completedVia?: CompletedVia;  // How it was completed
  };
  
  // Task-specific data for todo-style notifications
  task?: {
    tags?: string[];           // Categorization tags
    priority?: 'low' | 'medium' | 'high';
    dueDate?: string;          // ISO date for deadline tracking
    assignedTo?: string[];     // User IDs assigned to this task
    relatedItems?: {          // Links to other entities
      type: 'server' | 'document' | 'collection' | 'profile';
      id: string;
      name?: string;
    }[];
  };
  
  // MCP activity specific data
  mcpActivity?: {
    action: 'tool_call' | 'prompt_get' | 'resource_read' | 'install' | 'uninstall';
    itemName?: string;         // Tool/prompt/resource name
    success: boolean;
    errorMessage?: string;
    executionTime?: number;    // In milliseconds
  };
  
  // Custom fields for extensibility
  custom?: Record<string, any>;
}

// Type guard to check if metadata has source info
export function hasSourceInfo(metadata?: NotificationMetadata): boolean {
  return !!metadata?.source?.type;
}

// Type guard to check if notification was marked as read
export function wasMarkedRead(metadata?: NotificationMetadata): boolean {
  return !!metadata?.actions?.markedReadAt;
}

// Type guard to check if notification was completed
export function wasCompleted(metadata?: NotificationMetadata): boolean {
  return !!metadata?.actions?.completedAt;
}

// Helper to format source display
export function formatNotificationSource(metadata?: NotificationMetadata): string {
  if (!metadata?.source) return 'System';
  
  const { type, mcpServer, apiKeyName, userId } = metadata.source;
  
  switch (type) {
    case 'mcp':
      return mcpServer ? `MCP: ${mcpServer}` : 'MCP Server';
    case 'api':
      return apiKeyName ? `API: ${apiKeyName}` : 'API';
    case 'user':
      return userId ? `User: ${userId}` : 'User';
    case 'system':
    default:
      return 'System';
  }
}

/**
 * Sanitizes and validates notification metadata to ensure it conforms to the expected structure.
 * Removes undefined values and validates types.
 */
export function sanitizeMetadata(metadata: unknown): NotificationMetadata {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }
  
  const input = metadata as any;
  const sanitized: NotificationMetadata = {};
  
  // Validate and sanitize source
  if (input.source && typeof input.source === 'object') {
    const sourceTypes = ['user', 'system', 'mcp', 'api'] as const;
    sanitized.source = {
      type: sourceTypes.includes(input.source.type) ? input.source.type : 'system',
      ...(typeof input.source.userId === 'string' && { userId: input.source.userId }),
      ...(typeof input.source.profileUuid === 'string' && { profileUuid: input.source.profileUuid }),
      ...(typeof input.source.mcpServer === 'string' && { mcpServer: input.source.mcpServer }),
      ...(typeof input.source.mcpServerUuid === 'string' && { mcpServerUuid: input.source.mcpServerUuid }),
      ...(typeof input.source.apiKeyId === 'string' && { apiKeyId: input.source.apiKeyId }),
      ...(typeof input.source.apiKeyName === 'string' && { apiKeyName: input.source.apiKeyName }),
    };
  }
  
  // Validate and sanitize actions
  if (input.actions && typeof input.actions === 'object') {
    const completedViaValues: CompletedVia[] = ['web', 'api', 'mcp'];
    sanitized.actions = {
      ...(typeof input.actions.markedReadBy === 'string' && { markedReadBy: input.actions.markedReadBy }),
      ...(typeof input.actions.markedReadAt === 'string' && { markedReadAt: input.actions.markedReadAt }),
      ...(typeof input.actions.markedReadProfileUuid === 'string' && { markedReadProfileUuid: input.actions.markedReadProfileUuid }),
      ...(typeof input.actions.completedBy === 'string' && { completedBy: input.actions.completedBy }),
      ...(typeof input.actions.completedAt === 'string' && { completedAt: input.actions.completedAt }),
      ...(typeof input.actions.completedProfileUuid === 'string' && { completedProfileUuid: input.actions.completedProfileUuid }),
      ...(completedViaValues.includes(input.actions.completedVia) && { completedVia: input.actions.completedVia }),
    };
  }
  
  // Validate and sanitize task
  if (input.task && typeof input.task === 'object') {
    const priorities = ['low', 'medium', 'high'] as const;
    sanitized.task = {
      ...(Array.isArray(input.task.tags) && { tags: input.task.tags.filter((t: any) => typeof t === 'string') }),
      ...(priorities.includes(input.task.priority) && { priority: input.task.priority }),
      ...(typeof input.task.dueDate === 'string' && { dueDate: input.task.dueDate }),
      ...(Array.isArray(input.task.assignedTo) && { assignedTo: input.task.assignedTo.filter((t: any) => typeof t === 'string') }),
      ...(Array.isArray(input.task.relatedItems) && { 
        relatedItems: input.task.relatedItems
          .filter((item: any) => item && typeof item === 'object')
          .map((item: any) => ({
            type: item.type,
            id: item.id,
            ...(typeof item.name === 'string' && { name: item.name }),
          }))
          .filter((item: any) => ['server', 'document', 'collection', 'profile'].includes(item.type) && typeof item.id === 'string')
      }),
    };
  }
  
  // Validate and sanitize mcpActivity
  if (input.mcpActivity && typeof input.mcpActivity === 'object') {
    const actions = ['tool_call', 'prompt_get', 'resource_read', 'install', 'uninstall'] as const;
    sanitized.mcpActivity = {
      action: actions.includes(input.mcpActivity.action) ? input.mcpActivity.action : 'tool_call',
      success: Boolean(input.mcpActivity.success),
      ...(typeof input.mcpActivity.itemName === 'string' && { itemName: input.mcpActivity.itemName }),
      ...(typeof input.mcpActivity.errorMessage === 'string' && { errorMessage: input.mcpActivity.errorMessage }),
      ...(typeof input.mcpActivity.executionTime === 'number' && { executionTime: input.mcpActivity.executionTime }),
    };
  }
  
  // Preserve custom fields but ensure they're JSON-serializable
  if (input.custom && typeof input.custom === 'object') {
    try {
      sanitized.custom = JSON.parse(JSON.stringify(input.custom));
    } catch {
      // If custom data isn't JSON-serializable, skip it
    }
  }
  
  // Remove any undefined values by stringifying and parsing
  return JSON.parse(JSON.stringify(sanitized));
}

// Helper to format action display
export function formatNotificationAction(metadata?: NotificationMetadata): string | null {
  if (!metadata?.actions) return null;
  
  const { completedAt, completedVia, markedReadAt } = metadata.actions;
  
  if (completedAt && completedVia) {
    const date = new Date(completedAt);
    return `Completed via ${completedVia} at ${date.toLocaleString()}`;
  }
  
  if (markedReadAt) {
    const date = new Date(markedReadAt);
    return `Read at ${date.toLocaleString()}`;
  }
  
  return null;
}