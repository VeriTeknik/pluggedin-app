# MCP Playground

The MCP Playground allows you to test your MCP servers with LangChain integration. This feature converts MCP servers into LangChain tools and creates an agent that can use these tools based on natural language instructions.

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

## Troubleshooting

- **Connection Issues**: If you see connection errors, make sure your MCP servers are running and accessible
- **Authentication Errors**: Verify that any required API keys or credentials are properly configured
- **Tool Execution Errors**: Check that your MCP servers are functioning correctly outside the playground
- **Agent Understanding Issues**: Try to be specific in your requests and provide clear instructions 