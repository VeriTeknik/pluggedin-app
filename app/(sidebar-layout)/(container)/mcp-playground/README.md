# MCP Playground

The MCP Playground is a testing environment for MCP (Model Control Protocol) servers. It allows you to connect to multiple MCP servers and interact with them through a chat interface powered by LLMs like Claude or GPT.

## Getting Started

1. **Configure MCP Servers**: 
   - Before using the playground, make sure you have at least one active MCP server in your workspace
   - You can add and configure MCP servers in the "MCP Servers" section of the app

2. **Start a Playground Session**:
   - Select one or more MCP servers to include in your playground session
   - Configure the LLM settings (provider, model, temperature, etc.)
   - Click "Start Session" to initialize the agent with your selected MCP servers

3. **Use the Chat Interface**:
   - Once the session is active, you can send natural language messages to the agent
   - The agent will use the LangChain ReAct framework to call the appropriate MCP tools
   - Results from tool executions and agent responses will appear in the chat

4. **End the Session**:
   - When you're done testing, click "End Session" to clean up resources
   - This will properly shut down the MCP server connections

## Features

- **LLM Integration**: Supports both OpenAI and Anthropic models for agent capabilities
- **Interactive Testing**: Test your MCP servers with natural language prompts
- **ReAct Framework**: Uses LangChain's ReAct agent for reasoning and action execution
- **Multi-Server Support**: Test multiple MCP servers together in a single session

## How It Works

The playground uses the `@h1deya/langchain-mcp-tools` library to convert MCP servers into LangChain tools. This integration allows any LLM-powered agent to use MCP tools through a consistent interface.

When you start a session, the system:

1. Connects to your selected MCP servers
2. Registers their tools with LangChain
3. Creates a ReAct agent with your chosen LLM
4. Sets up a conversational interface for the agent

When you send a message:

1. The agent receives your input as a human message
2. It uses the ReAct framework to decide which tools to call
3. It executes the tools and receives results
4. It provides a final response based on the results

## Log Capture System

The Playground includes a comprehensive log capture system that collects logs from MCP servers at various levels:

### Log Levels

The system supports the following log levels from the `langchain-mcp-tools` package:

- **TRACE**: Most verbose level for detailed tracing (gray)
- **DEBUG**: Debugging information (light blue)
- **INFO**: General information messages (blue)
- **WARN**: Warning messages that don't stop execution (yellow)
- **ERROR**: Error messages that might allow continued execution (red)
- **FATAL**: Critical errors that stop execution (bold red with background)

Additionally, the UI categorizes logs into functional types:

- **Connection**: Logs related to connecting to MCP servers (green)
- **Execution**: Logs about tool execution (amber)
- **Response**: Logs containing tool responses (purple)

### How Log Capture Works

1. The system intercepts console output from the `langchain-mcp-tools` package
2. Log messages are parsed to determine their level and type
3. Logs are stored with timestamps in the session state
4. The UI displays logs with color coding and filtering options

### Configuring Log Level

You can configure the verbosity of logs when starting a session:

1. Select a log level in the Model configuration tab
2. Higher levels (like Debug or Trace) include all lower level messages
3. The default level is "Info", which provides a balanced amount of detail

### Filtering Logs

The Logs tab includes filters that let you:

- Show/hide specific log levels
- Focus on particular types of operations
- View initialization logs separately from runtime logs

### Implementation Details

- Console overrides in `app/actions/mcp-playground.ts` capture logs
- The logger from `langchain-mcp-tools` uses standard console methods with level prefixes
- Log capture preserves the original console behavior while adding collection

## Troubleshooting

- **Connection Issues**: If you see connection errors, make sure your MCP servers are running and accessible
- **Authentication Errors**: Verify that any required API keys or credentials are properly configured
- **Tool Execution Errors**: Check that your MCP servers are functioning correctly outside the playground
- **Agent Understanding Issues**: Try to be specific in your requests and provide clear instructions
- **Log Capture Issues**: If you're not seeing expected logs, check the log level, filters, and server connection

If you're not seeing expected logs:

1. Check that the log level is set appropriately (higher levels include more detail)
2. Verify that log filters are enabled for the types of logs you want to see
3. Make sure MCP servers are properly connected and active
4. Check the server implementation to ensure it's using the logger correctly 