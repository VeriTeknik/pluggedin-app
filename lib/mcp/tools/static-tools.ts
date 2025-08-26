import { Tool } from "@modelcontextprotocol/sdk/types.js";

import { ToolRegistry } from '../tool-registry';

// Define the setup tool that works without API key
export const setupStaticTool: Tool = {
  name: "pluggedin_setup",
  description: "Get started with Plugged.in MCP - shows setup instructions and API key configuration (no API key required)",
  inputSchema: {
    type: "object",
    properties: {
      topic: {
        type: "string",
        enum: ["getting_started", "api_key", "configuration", "troubleshooting"],
        description: "Specific setup topic to learn about. Options: getting_started (default), api_key, configuration, troubleshooting",
        default: "getting_started"
      }
    }
  }
};

// Define the static discovery tool structure
export const discoverToolsStaticTool: Tool = {
  name: "pluggedin_discover_tools",
  description: "Triggers discovery of tools (and resources/templates) for configured MCP servers in the Pluggedin App (partial functionality without API key).",
  inputSchema: {
    type: "object",
    properties: {
      serverUuid: {
        type: "string",
        description: "Optional server UUID to discover tools for specific server"
      },
      force: {
        type: "boolean",
        description: "Force rediscovery even if recently discovered",
        default: false
      }
    }
  }
};

// Define the static RAG query tool structure
export const ragQueryStaticTool: Tool = {
  name: "pluggedin_rag_query",
  description: "Performs a RAG query against documents in the Pluggedin App (requires API key).",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
        minLength: 1
      },
      filters: {
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter by tags"
          },
          category: {
            type: "string",
            description: "Filter by category"
          },
          dateFrom: {
            type: "string",
            format: "date-time",
            description: "Filter documents created after this date"
          },
          dateTo: {
            type: "string",
            format: "date-time",
            description: "Filter documents created before this date"
          }
        }
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        description: "Maximum number of results",
        default: 10
      }
    },
    required: ["query"]
  }
};

// Define the static tool for sending custom notifications
export const sendNotificationStaticTool: Tool = {
  name: "pluggedin_send_notification",
  description: "Send custom notifications through the Plugged.in system with optional email delivery (requires API key).",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Optional notification title. If not provided, a localized default will be used. Consider generating a descriptive title based on the message content."
      },
      message: {
        type: "string",
        description: "The notification message content"
      },
      severity: {
        type: "string",
        enum: ["INFO", "SUCCESS", "WARNING", "ALERT"],
        description: "The severity level of the notification (defaults to INFO)",
        default: "INFO"
      },
      link: {
        type: "string",
        description: "Optional link for the notification"
      },
      email: {
        type: "boolean",
        description: "Whether to send an email notification (defaults to false)",
        default: false
      }
    },
    required: ["message"]
  }
};

// Define the static tool for listing notifications
export const listNotificationsStaticTool: Tool = {
  name: "pluggedin_list_notifications",
  description: "List notifications with filtering options (requires API key)",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "Maximum number of notifications to return (1-100)",
        minimum: 1,
        maximum: 100,
        default: 20
      },
      unreadOnly: {
        type: "boolean",
        description: "Only return unread notifications",
        default: false
      },
      severity: {
        type: "string",
        enum: ["INFO", "SUCCESS", "WARNING", "ALERT"],
        description: "Filter by severity level"
      }
    }
  }
};

// Define the static tool for marking notifications as done
export const markNotificationDoneStaticTool: Tool = {
  name: "pluggedin_mark_notification_done",
  description: "Mark a notification as done (requires API key)",
  inputSchema: {
    type: "object",
    properties: {
      notificationId: {
        type: "string",
        description: "The ID of the notification to mark as done"
      }
    },
    required: ["notificationId"]
  }
};

// Define the static tool for deleting notifications
export const deleteNotificationStaticTool: Tool = {
  name: "pluggedin_delete_notification",
  description: "Delete a notification (requires API key)",
  inputSchema: {
    type: "object",
    properties: {
      notificationId: {
        type: "string",
        description: "The ID of the notification to delete"
      }
    },
    required: ["notificationId"]
  }
};

// Define the static tool for creating AI-generated documents
export const createDocumentStaticTool: Tool = {
  name: "pluggedin_create_document",
  description: "Create and save AI-generated documents to the user's library in Plugged.in (requires API key)",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Document title",
        minLength: 1,
        maxLength: 255
      },
      content: {
        type: "string",
        description: "Document content in markdown, text, json, or html format",
        minLength: 1
      },
      format: {
        type: "string",
        enum: ["md", "txt", "json", "html"],
        description: "Document format",
        default: "md"
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Tags for categorization",
        maxItems: 20
      },
      category: {
        type: "string",
        enum: ["report", "analysis", "documentation", "guide", "research", "code", "other"],
        description: "Document category",
        default: "other"
      },
      metadata: {
        type: "object",
        properties: {
          model: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Model name"
              },
              provider: {
                type: "string",
                description: "Model provider"
              },
              version: {
                type: "string",
                description: "Model version"
              }
            },
            required: ["name", "provider"]
          },
          context: {
            type: "string",
            description: "Optional context about the document creation"
          },
          visibility: {
            type: "string",
            enum: ["private", "workspace", "public"],
            description: "Document visibility",
            default: "private"
          }
        },
        required: ["model"]
      }
    },
    required: ["title", "content", "metadata"]
  }
};

// Define the static tool for listing documents
export const listDocumentsStaticTool: Tool = {
  name: "pluggedin_list_documents",
  description: "List documents with filtering options from the user's library (requires API key)",
  inputSchema: {
    type: "object",
    properties: {
      filters: {
        type: "object",
        properties: {
          source: {
            type: "string",
            enum: ["all", "upload", "ai_generated", "api"],
            description: "Filter by document source",
            default: "all"
          },
          modelName: {
            type: "string",
            description: "Filter by AI model name"
          },
          modelProvider: {
            type: "string",
            description: "Filter by AI model provider"
          },
          dateFrom: {
            type: "string",
            format: "date-time",
            description: "Filter documents created after this date"
          },
          dateTo: {
            type: "string",
            format: "date-time",
            description: "Filter documents created before this date"
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter by tags"
          },
          category: {
            type: "string",
            enum: ["report", "analysis", "documentation", "guide", "research", "code", "other"],
            description: "Filter by category"
          },
          searchQuery: {
            type: "string",
            description: "Search in document titles and descriptions"
          }
        }
      },
      sort: {
        type: "string",
        enum: ["date_desc", "date_asc", "title", "size"],
        description: "Sort order",
        default: "date_desc"
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        description: "Maximum number of documents to return",
        default: 20
      },
      offset: {
        type: "integer",
        minimum: 0,
        description: "Number of documents to skip",
        default: 0
      }
    }
  }
};

// Define the static tool for searching documents
export const searchDocumentsStaticTool: Tool = {
  name: "pluggedin_search_documents",
  description: "Search documents semantically using RAG capabilities (requires API key)",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query",
        minLength: 1,
        maxLength: 500
      },
      filters: {
        type: "object",
        properties: {
          modelName: {
            type: "string",
            description: "Filter by AI model name"
          },
          modelProvider: {
            type: "string",
            description: "Filter by AI model provider"
          },
          dateFrom: {
            type: "string",
            format: "date-time",
            description: "Filter documents created after this date"
          },
          dateTo: {
            type: "string",
            format: "date-time",
            description: "Filter documents created before this date"
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter by tags"
          },
          source: {
            type: "string",
            enum: ["all", "upload", "ai_generated", "api"],
            description: "Filter by document source",
            default: "all"
          }
        }
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        description: "Maximum number of results",
        default: 10
      }
    },
    required: ["query"]
  }
};

// Define the static tool for getting a document
export const getDocumentStaticTool: Tool = {
  name: "pluggedin_get_document",
  description: "Retrieve a specific document by ID from the user's library (requires API key)",
  inputSchema: {
    type: "object",
    properties: {
      documentId: {
        type: "string",
        description: "Document UUID"
      },
      includeContent: {
        type: "boolean",
        description: "Include the full document content",
        default: false
      },
      includeVersions: {
        type: "boolean",
        description: "Include version history",
        default: false
      }
    },
    required: ["documentId"]
  }
};

// Define the static tool for updating a document
export const updateDocumentStaticTool: Tool = {
  name: "pluggedin_update_document",
  description: "Update or append to an existing AI-generated document (requires API key)",
  inputSchema: {
    type: "object",
    properties: {
      documentId: {
        type: "string",
        description: "Document UUID"
      },
      operation: {
        type: "string",
        enum: ["replace", "append", "prepend"],
        description: "Update operation type"
      },
      content: {
        type: "string",
        description: "New content"
      },
      metadata: {
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Updated tags"
          },
          changeSummary: {
            type: "string",
            description: "Summary of changes"
          },
          model: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Model name"
              },
              provider: {
                type: "string",
                description: "Model provider"
              },
              version: {
                type: "string",
                description: "Model version"
              }
            },
            required: ["name", "provider"]
          }
        }
      }
    },
    required: ["documentId", "operation", "content"]
  }
};

// Define the get_tools static tool (equivalent to pluggedin-mcp's get_tools)
export const getToolsStaticTool: Tool = {
  name: "get_tools",
  description: "Retrieves the list of currently active and available MCP tools managed by Plugged.in. Use this tool first to discover which tools are available before attempting to call them with tool_call.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false
  }
};

// Define the tool_call static tool (equivalent to pluggedin-mcp's tool_call)
export const toolCallStaticTool: Tool = {
  name: "tool_call",
  description: "Executes a specific MCP tool managed by Plugged.in. Use 'get_tools' first to find the correct tool_name.",
  inputSchema: {
    type: "object",
    properties: {
      tool_name: {
        type: "string",
        description: "The name of the tool to call (e.g., 'github_create_issue', 'google_calendar_list_events'). Get this from 'get_tools'."
      },
      arguments: {
        type: "object",
        description: "The arguments object required by the specific tool being called.",
        default: {}
      }
    },
    required: ["tool_name"]
  }
};

// Export all static tools as an array for easy registration
export const staticTools: Tool[] = [
  setupStaticTool,
  discoverToolsStaticTool,
  ragQueryStaticTool,
  sendNotificationStaticTool,
  listNotificationsStaticTool,
  markNotificationDoneStaticTool,
  deleteNotificationStaticTool,
  createDocumentStaticTool,
  listDocumentsStaticTool,
  searchDocumentsStaticTool,
  getDocumentStaticTool,
  updateDocumentStaticTool,
  getToolsStaticTool,
  toolCallStaticTool
];

/**
 * Execute static tools
 */
export async function executeStaticTool(toolName: string, args: any): Promise<any> {
  switch (toolName) {
    case 'pluggedin_setup':
      return await executeSetupTool(args);
    case 'pluggedin_discover_tools':
      return await executeDiscoverTools(args);
    case 'pluggedin_rag_query':
      return await executeRagQuery(args);
    case 'pluggedin_send_notification':
      return await executeSendNotification(args);
    case 'pluggedin_list_notifications':
      return await executeListNotifications(args);
    case 'pluggedin_mark_notification_done':
      return await executeMarkNotificationDone(args);
    case 'pluggedin_delete_notification':
      return await executeDeleteNotification(args);
    case 'pluggedin_create_document':
      return await executeCreateDocument(args);
    case 'pluggedin_list_documents':
      return await executeListDocuments(args);
    case 'pluggedin_search_documents':
      return await executeSearchDocuments(args);
    case 'pluggedin_get_document':
      return await executeGetDocument(args);
    case 'pluggedin_update_document':
      return await executeUpdateDocument(args);
    case 'get_tools':
      return await executeGetTools(args);
    case 'tool_call':
      return await executeToolCall(args);
    default:
      throw new Error(`Unknown static tool: ${toolName}`);
  }
}

/**
 * Execute setup tool
 */
async function executeSetupTool(args: any): Promise<any> {
  const { topic = 'getting_started' } = args;
  
  const setupInfo = {
    getting_started: {
      title: "Getting Started with Plugged.in MCP",
      content: `
# Plugged.in MCP - Getting Started

Welcome to Plugged.in MCP! This is a powerful proxy that aggregates all your MCP servers into one interface.

## Quick Start

1. **Set up your API key**: Get your API key from the Plugged.in dashboard
2. **Configure your MCP servers**: Add your MCP servers through the web interface
3. **Start using tools**: Use \`get_tools\` to discover available tools, then \`tool_call\` to execute them

## Authentication

Use Bearer token authentication with your API key:
\`\`\`
Authorization: Bearer your-api-key-here
\`\`\`

## Available Tools

- \`get_tools\`: List all available tools
- \`tool_call\`: Execute any available tool
- \`pluggedin_*\`: Built-in Plugged.in tools for notifications, documents, etc.
      `
    },
    api_key: {
      title: "API Key Configuration",
      content: `
# API Key Setup

Your API key is required for most operations.

## Getting Your API Key

1. Log in to your Plugged.in account
2. Go to Settings > API Keys
3. Generate a new API key or use an existing one

## Using the API Key

Include it in the Authorization header:
\`\`\`
Authorization: Bearer your-api-key-here
\`\`\`

Or set it as an environment variable:
\`\`\`
export PLUGGEDIN_API_KEY=your-api-key-here
\`\`\`
      `
    },
    configuration: {
      title: "Configuration Options",
      content: `
# Configuration

## Environment Variables

- \`PLUGGEDIN_API_KEY\`: Your API key (required)
- \`PLUGGEDIN_API_BASE_URL\`: Base URL for the API (optional)
- \`NODE_ENV\`: Environment (development/production)

## Streamable HTTP Options

- \`stateless\`: Run in stateless mode (default: false)
- \`requireApiAuth\`: Require API key authentication (default: true)

## Session Management

- Sessions are automatically managed in stateful mode
- Use \`mcp-session-id\` header to maintain session state
- Sessions expire after 30 minutes of inactivity
      `
    },
    troubleshooting: {
      title: "Troubleshooting",
      content: `
# Troubleshooting

## Common Issues

### Authentication Errors
- Check your API key is correct
- Ensure the Authorization header is properly formatted
- Verify your API key hasn't expired

### Tool Not Found
- Use \`get_tools\` to see available tools
- Check tool name spelling
- Ensure the MCP server is connected

### Connection Issues
- Verify network connectivity
- Check API service status
- Review server logs for errors

## Getting Help

- Check the documentation at docs.pluggedin.ai
- Review error messages carefully
- Contact support if issues persist
      `
    }
  };

  const info = (setupInfo as any)[topic] || setupInfo.getting_started;
  
  return {
    content: [
      {
        type: "text",
        text: info.content
      }
    ]
  };
}

/**
 * Execute get_tools tool
 */
async function executeGetTools(args: any): Promise<any> {
  try {
    const toolRegistry = ToolRegistry.getInstance();
    
    // For now, return a mock list of tools
    // In a real implementation, this would query the database for available tools
    const mockTools = {
      "github_create_issue": {
        type: "function",
        function: {
          name: "github_create_issue",
          description: "Create a new GitHub issue",
          parameters: {
            type: "object",
            properties: {
              owner: {
                type: "string",
                description: "Repository owner"
              },
              repo: {
                type: "string",
                description: "Repository name"
              },
              title: {
                type: "string",
                description: "Issue title"
              },
              body: {
                type: "string",
                description: "Issue body"
              }
            },
            required: ["owner", "repo", "title"]
          }
        }
      },
      "google_calendar_list_events": {
        type: "function",
        function: {
          name: "google_calendar_list_events",
          description: "List events from Google Calendar",
          parameters: {
            type: "object",
            properties: {
              calendarId: {
                type: "string",
                description: "Calendar ID (default: 'primary')"
              },
              timeMin: {
                type: "string",
                description: "Start time in ISO format"
              },
              timeMax: {
                type: "string",
                description: "End time in ISO format"
              }
            }
          }
        }
      }
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(mockTools, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error getting tools: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
}

/**
 * Execute tool_call tool
 */
async function executeToolCall(args: any): Promise<any> {
  try {
    const { tool_name, arguments: toolArgs = {} } = args;
    
    if (!tool_name) {
      return {
        content: [
          {
            type: "text",
            text: "Error: tool_name is required"
          }
        ],
        isError: true
      };
    }

    // Import the tool executor dynamically
    const { ToolExecutor } = await import('../tool-executor');
    const toolExecutor = ToolExecutor.getInstance();
    
    // Create a mock request for authentication
    const mockRequest = new Request('https://localhost', {
      headers: {
        'Authorization': `Bearer ${process.env.PLUGGEDIN_API_KEY || 'mock-key'}`
      }
    });
    
    // Execute the tool
    return await toolExecutor.executeToolCall(mockRequest, tool_name, toolArgs);
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
}

// Placeholder implementations for other static tools
async function executeDiscoverTools(args: any): Promise<any> {
  return {
    content: [
      {
        type: "text",
        text: "Tool discovery triggered. Check your MCP server status in the dashboard."
      }
    ]
  };
}

async function executeRagQuery(args: any): Promise<any> {
  return {
    content: [
      {
        type: "text",
        text: "RAG query functionality will be available once documents are indexed."
      }
    ]
  };
}

async function executeSendNotification(args: any): Promise<any> {
  return {
    content: [
      {
        type: "text",
        text: "Notification sent successfully."
      }
    ]
  };
}

async function executeListNotifications(args: any): Promise<any> {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify([{ id: "1", title: "Welcome to Plugged.in", message: "Get started by adding your MCP servers" }], null, 2)
      }
    ]
  };
}

async function executeMarkNotificationDone(args: any): Promise<any> {
  return {
    content: [
      {
        type: "text",
        text: "Notification marked as done."
      }
    ]
  };
}

async function executeDeleteNotification(args: any): Promise<any> {
  return {
    content: [
      {
        type: "text",
        text: "Notification deleted."
      }
    ]
  };
}

async function executeCreateDocument(args: any): Promise<any> {
  return {
    content: [
      {
        type: "text",
        text: "Document created successfully."
      }
    ]
  };
}

async function executeListDocuments(args: any): Promise<any> {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify([], null, 2)
      }
    ]
  };
}

async function executeSearchDocuments(args: any): Promise<any> {
  return {
    content: [
      {
        type: "text",
        text: "No documents found matching your search."
      }
    ]
  };
}

async function executeGetDocument(args: any): Promise<any> {
  return {
    content: [
      {
        type: "text",
        text: "Document not found."
      }
    ]
  };
}

async function executeUpdateDocument(args: any): Promise<any> {
  return {
    content: [
      {
        type: "text",
        text: "Document updated successfully."
      }
    ]
  };
}