// Notification metadata types for enhanced tracking

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
    completedVia?: 'web' | 'api' | 'mcp';  // How it was completed
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