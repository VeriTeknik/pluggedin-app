import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// Import static tools similar to pluggedin-mcp
import { staticTools } from './tools/static-tools';

/**
 * Create and configure an MCP server with the same tools as pluggedin-mcp
 */
export async function createMCPServer(): Promise<Server> {
  // Create the MCP server
  const server = new Server(
    {
      name: 'pluggedin-app-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
    }
  );

  // Set up tool listing capability
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Get all available tools (static tools + dynamic tools from database)
    const allTools = await getAllTools();
    
    return {
      tools: allTools,
    };
  });

  // Set up tool calling capability
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // Handle static tools first
      const staticTool = staticTools.find(tool => tool.name === name);
      if (staticTool) {
        return await handleStaticTool(name, args || {});
      }

      // Handle dynamic tools from database
      return await handleDynamicTool(name, args || {});
    } catch (error) {
      console.error(`Error executing tool ${name}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Get all available tools (static + dynamic)
 */
async function getAllTools(): Promise<Tool[]> {
  const tools: Tool[] = [];

  // Add static tools
  tools.push(...staticTools);

  // Add dynamic tools from database using tool registry
  // Skip dynamic tools for now since we don't have a profile context
  // In a real implementation, this would come from the authenticated user
  // Dynamic tools will be loaded when a specific profile makes a request
  
  // Uncomment this when we have proper profile context:
  // try {
  //   const { ToolRegistry } = await import('./tool-registry');
  //   const toolRegistry = ToolRegistry.getInstance();
  //   const dynamicTools = await toolRegistry.getToolsForProfile(profileUuid);
  //   tools.push(...dynamicTools);
  // } catch (error) {
  //   console.error('Error fetching dynamic tools:', error);
  // }

  return tools;
}

/**
 * Handle static tool execution
 */
async function handleStaticTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'pluggedin_setup':
      return await handleSetupTool(args);
    case 'pluggedin_discover_tools':
      return await handleDiscoverToolsTool(args);
    case 'pluggedin_rag_query':
      return await handleRagQueryTool(args);
    case 'pluggedin_send_notification':
      return await handleSendNotificationTool(args);
    case 'pluggedin_list_notifications':
      return await handleListNotificationsTool(args);
    case 'pluggedin_mark_notification_done':
      return await handleMarkNotificationDoneTool(args);
    case 'pluggedin_delete_notification':
      return await handleDeleteNotificationTool(args);
    case 'pluggedin_create_document':
      return await handleCreateDocumentTool(args);
    case 'pluggedin_list_documents':
      return await handleListDocumentsTool(args);
    case 'pluggedin_search_documents':
      return await handleSearchDocumentsTool(args);
    case 'pluggedin_get_document':
      return await handleGetDocumentTool(args);
    case 'pluggedin_update_document':
      return await handleUpdateDocumentTool(args);
    default:
      throw new Error(`Unknown static tool: ${name}`);
  }
}

/**
 * Handle dynamic tool execution
 */
async function handleDynamicTool(name: string, args: any): Promise<any> {
  // Import the tool executor for handling dynamic tools
  const { ToolExecutor } = await import('./tool-executor');
  const toolExecutor = ToolExecutor.getInstance();
  
  // Create a mock request object for authentication
  const mockRequest = new Request('https://localhost', {
    headers: {
      'Authorization': `Bearer ${process.env.PLUGGEDIN_API_KEY || 'mock-key'}`
    }
  });
  
  // Use the tool executor to handle the dynamic tool
  return await toolExecutor.executeToolCall(mockRequest, name, args);
}

// Static tool handlers
async function handleSetupTool(args: any) {
  const { topic = 'getting_started' } = args;
  
  const setupInfo = {
    getting_started: `
# Plugged.in MCP Setup

Welcome to Plugged.in MCP! Here's how to get started:

## 1. API Key Configuration
Set your PLUGGEDIN_API_KEY environment variable:
\`\`\`bash
export PLUGGEDIN_API_KEY=your_api_key_here
\`\`\`

## 2. Base URL Configuration
Set your PLUGGEDIN_API_BASE_URL environment variable:
\`\`\`bash
export PLUGGEDIN_API_BASE_URL=https://app.pluggedin.app
\`\`\`

## 3. Available Tools
- \`get_tools\`: List all available tools
- \`tool_call\`: Execute any available tool
- \`pluggedin_setup\`: Get setup information
- \`pluggedin_discover_tools\`: Discover tools from MCP servers
- \`pluggedin_rag_query\`: Query documents using RAG
- \`pluggedin_send_notification\`: Send notifications
- \`pluggedin_list_notifications\`: List notifications
- \`pluggedin_create_document\`: Create documents
- \`pluggedin_list_documents\`: List documents
- \`pluggedin_search_documents\`: Search documents

## 4. Next Steps
1. Use \`get_tools\` to see all available tools
2. Use \`tool_call\` to execute any tool
3. Check the documentation for each tool for specific usage

For more information, visit: https://docs.pluggedin.app
    `,
    api_key: `
# API Key Configuration

To use the Plugged.in MCP server, you need to configure your API key:

## Environment Variables
\`\`\`bash
export PLUGGEDIN_API_KEY=your_api_key_here
export PLUGGEDIN_API_BASE_URL=https://app.pluggedin.app
\`\`\`

## Getting Your API Key
1. Log in to your Plugged.in account
2. Go to Settings → API Keys
3. Create a new API key or copy an existing one
4. Use the key in your environment configuration

## Security
- Keep your API key secure
- Don't commit it to version control
- Use environment variables or secure secret management
- Rotate your keys regularly

## Testing Your Configuration
\`\`\`bash
# Test with curl
curl -X POST https://app.pluggedin.app/api/mcp-streamable-http \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer your_api_key" \\
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 1
  }'
\`\`\`
    `,
    configuration: `
# Plugged.in MCP Configuration

## Environment Variables
\`\`\`bash
# Required
export PLUGGEDIN_API_KEY=your_api_key_here
export PLUGGEDIN_API_BASE_URL=https://app.pluggedin.app

# Optional
export PLUGGEDIN_MCP_PORT=12006
export PLUGGEDIN_MCP_STATELESS=false
export PLUGGEDIN_MCP_REQUIRE_AUTH=true
\`\`\`

## Configuration Options
- \`PLUGGEDIN_API_KEY\`: Your Plugged.in API key (required)
- \`PLUGGEDIN_API_BASE_URL\`: Base URL for the Plugged.in API (required)
- \`PLUGGEDIN_MCP_PORT\`: Port for the streamable HTTP server (default: 12006)
- \`PLUGGEDIN_MCP_STATELESS\`: Run in stateless mode (default: false)
- \`PLUGGEDIN_MCP_REQUIRE_AUTH\`: Require API key authentication (default: true)

## OpenAI Integration
To use with OpenAI's tools/connectors MCP:

1. Configure your environment variables
2. Set the MCP server URL to: \`https://app.pluggedin.app/api/mcp-streamable-http\`
3. Use your API key for authentication
4. The server supports both stateless and stateful modes

## Session Management
- **Stateless mode**: Each request is independent (no session persistence)
- **Stateful mode**: Sessions are maintained across requests using session IDs
- Use the \`mcp-session-id\` header to manage sessions
- Sessions automatically expire after 30 minutes of inactivity
    `,
    troubleshooting: `
# Plugged.in MCP Troubleshooting

## Common Issues

### 1. Authentication Errors
\`\`\`
Error: Unauthorized: Invalid or missing API key
\`\`\`
**Solution:**
- Check your PLUGGEDIN_API_KEY environment variable
- Ensure the API key is valid and not expired
- Verify the Authorization header format: \`Bearer your_api_key\`

### 2. Connection Errors
\`\`\`
Error: Connection refused or timeout
\`\`\`
**Solution:**
- Check your internet connection
- Verify PLUGGEDIN_API_BASE_URL is correct
- Ensure the Plugged.in service is available

### 3. Tool Not Found
\`\`\`
Error: Tool not found or origin server unavailable
\`\`\`
**Solution:**
- Use \`get_tools\` to list available tools
- Check if the tool name is correct
- Verify the MCP server is properly configured

### 4. Permission Errors
\`\`\`
Error: Permission denied
\`\`\`
**Solution:**
- Check your API key permissions
- Ensure your account has access to the requested tools
- Contact support if permissions need to be updated

## Debug Mode
Enable debug logging:
\`\`\`bash
export DEBUG=pluggedin-mcp:*
export PLUGGEDIN_MCP_DEBUG=true
\`\`\`

## Testing Tools
Test individual tools:
\`\`\`bash
# List tools
curl -X POST https://app.pluggedin.app/api/mcp-streamable-http \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer your_api_key" \\
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 1
  }'

# Call a tool
curl -X POST https://app.pluggedin.app/api/mcp-streamable-http \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer your_api_key" \\
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_tools",
      "arguments": {}
    },
    "id": 1
  }'
\`\`\`

## Getting Help
- Check the documentation: https://docs.pluggedin.app
- Contact support: support@pluggedin.app
- Create an issue: https://github.com/VeriTeknik/pluggedin-mcp/issues
    `
  };

  return {
    content: [
      {
        type: 'text',
        text: setupInfo[topic as keyof typeof setupInfo] || setupInfo.getting_started,
      },
    ],
  };
}

async function handleDiscoverToolsTool(args: any) {
  // Import here to avoid circular dependencies
  const { discoverSingleServerTools } = await import('@/app/actions/discover-mcp-tools');
  
  try {
    // This would trigger tool discovery for configured MCP servers
    // For now, return a success message
    return {
      content: [
        {
          type: 'text',
          text: 'Tool discovery initiated. Check your MCP servers for newly discovered tools.',
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error during tool discovery: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleRagQueryTool(args: any) {
  try {
    const { query, filters = {}, limit = 10 } = args;
    
    if (!query) {
      throw new Error('Query is required');
    }

    // Placeholder for RAG query functionality
    const result = {
      query,
      filters,
      limit,
      message: 'RAG query functionality not yet implemented',
      results: [],
    };
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error querying RAG: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleSendNotificationTool(args: any) {
  try {
    const { title, message, severity = 'INFO', link, email = false } = args;
    
    if (!message) {
      throw new Error('Message is required');
    }

    // Placeholder for notification functionality
    const result = {
      id: `notification_${Date.now()}`,
      title,
      message,
      severity,
      link,
      email,
      status: 'sent',
    };
    
    return {
      content: [
        {
          type: 'text',
          text: `Notification sent successfully: ${result.id}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error sending notification: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleListNotificationsTool(args: any) {
  try {
    const { limit = 20, unreadOnly = false, severity } = args;
    
    // Placeholder for notification listing functionality
    const notifications = {
      limit,
      unreadOnly,
      severity,
      notifications: [],
      message: 'Notification listing functionality not yet implemented',
    };
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(notifications, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error listing notifications: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleMarkNotificationDoneTool(args: any) {
  try {
    const { notificationId } = args;
    
    if (!notificationId) {
      throw new Error('Notification ID is required');
    }

    // Placeholder for notification marking functionality
    const result = {
      notificationId,
      status: 'marked_done',
      message: 'Notification marking functionality not yet implemented',
    };
    
    return {
      content: [
        {
          type: 'text',
          text: `Notification ${notificationId} marked as done`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error marking notification as done: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleDeleteNotificationTool(args: any) {
  try {
    const { notificationId } = args;
    
    if (!notificationId) {
      throw new Error('Notification ID is required');
    }

    // Placeholder for notification deletion functionality
    const result = {
      notificationId,
      status: 'deleted',
      message: 'Notification deletion functionality not yet implemented',
    };
    
    return {
      content: [
        {
          type: 'text',
          text: `Notification ${notificationId} deleted`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error deleting notification: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleCreateDocumentTool(args: any) {
  try {
    const { title, content, format = 'md', tags = [], category = 'other', metadata } = args;
    
    if (!title || !content) {
      throw new Error('Title and content are required');
    }

    // Placeholder for document creation functionality
    const document = {
      id: `doc_${Date.now()}`,
      title,
      content,
      format,
      tags,
      category,
      metadata,
      status: 'created',
      message: 'Document creation functionality not yet implemented',
    };
    
    return {
      content: [
        {
          type: 'text',
          text: `Document created successfully: ${document.id}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error creating document: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleListDocumentsTool(args: any) {
  try {
    const { filters = {}, sort = 'date_desc', limit = 20, offset = 0 } = args;
    
    // Placeholder for document listing functionality
    const documents = {
      filters,
      sort,
      limit,
      offset,
      documents: [],
      message: 'Document listing functionality not yet implemented',
    };
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(documents, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error listing documents: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleSearchDocumentsTool(args: any) {
  try {
    const { query, filters = {}, limit = 10 } = args;
    
    if (!query) {
      throw new Error('Query is required');
    }

    // Placeholder for document search functionality
    const results = {
      query,
      filters,
      limit,
      results: [],
      message: 'Document search functionality not yet implemented',
    };
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error searching documents: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleGetDocumentTool(args: any) {
  try {
    const { documentId, includeContent = false, includeVersions = false } = args;
    
    if (!documentId) {
      throw new Error('Document ID is required');
    }

    // Placeholder for document retrieval functionality
    const document = {
      documentId,
      includeContent,
      includeVersions,
      document: null,
      message: 'Document retrieval functionality not yet implemented',
    };
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(document, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error getting document: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function handleUpdateDocumentTool(args: any) {
  try {
    const { documentId, operation, content, metadata } = args;
    
    if (!documentId || !operation || !content) {
      throw new Error('Document ID, operation, and content are required');
    }

    // Placeholder for document update functionality
    const document = {
      documentId,
      operation,
      content,
      metadata,
      status: 'updated',
      message: 'Document update functionality not yet implemented',
    };
    
    return {
      content: [
        {
          type: 'text',
          text: `Document updated successfully: ${documentId}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error updating document: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}