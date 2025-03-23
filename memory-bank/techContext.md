# Plugged.in Technical Context

## Technology Stack

Plugged.in is built on a modern web technology stack:

### Frontend
- **Framework**: Next.js 15.2.3 with App Router
- **UI Components**: Custom components based on Radix UI with Tailwind CSS
- **State Management**: React Hooks and Context API
- **Data Fetching**: SWR for client-side data fetching

### Backend
- **Runtime**: Node.js with Next.js Server Actions and API Routes
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: API key-based authentication
- **MCP Integration**: Native MCP protocol implementation

### LangChain Integration
- **Library**: @h1deya/langchain-mcp-tools for MCP to LangChain conversion
- **Agent Framework**: ReAct agent from @langchain/langgraph/prebuilt
- **LLM Providers**: 
  - Anthropic (Claude 3.5/3.7 models)
  - OpenAI (GPT-4o/GPT-3.5)
- **Memory Management**: MemorySaver for agent state persistence

## Development Tools

- **Package Manager**: pnpm
- **TypeScript**: Type-safe JavaScript
- **Linting**: ESLint
- **Formatting**: Prettier
- **Database Migrations**: Drizzle Kit
- **Environment Variables**: dotenv

## Key Dependencies

```json
{
  "dependencies": {
    "@h1deya/langchain-mcp-tools": "^0.1.16",
    "@langchain/community": "^0.3.24",
    "@langchain/core": "^0.3.30",
    "@langchain/langgraph": "^0.2.57",
    "drizzle-orm": "^0.38.2",
    "next": "15.2.3",
    "pg": "^8.13.1",
    "react": "^19.0.0",
    "swr": "^2.3.0",
    "zod": "^3.24.1"
  }
}
```

## Database Schema

The database uses PostgreSQL with the following primary tables:

1. **projects**: Top-level organization units
2. **profiles**: Workspaces within projects
3. **mcp_servers**: MCP server configurations
4. **api_keys**: Authentication tokens
5. **codes**: Stored Python code for custom MCP servers
6. **custom_mcp_servers**: Custom MCP server configurations

## Integration Points

### MCP Protocol Integration

The application implements the MCP protocol for:

1. **Tool Discovery**: Gathering available tools from MCP servers
2. **Tool Execution**: Routing tool calls to appropriate servers
3. **Result Handling**: Processing and returning tool execution results

### LangChain Integration

The MCP Playground implements LangChain integration for:

1. **MCP Server Conversion**: Converting MCP servers to LangChain tools
2. **Agent Initialization**: Creating ReAct agents with configured LLMs
3. **Message Processing**: Handling various message formats from tool execution
4. **Session Management**: Managing LLM agent sessions with proper cleanup

## Deployment Considerations

### Docker-Based Deployment

The application can be deployed using Docker:

```bash
docker compose up --build -d
```

### Environment Configuration

Key environment variables:

- `DATABASE_URL`: PostgreSQL connection string
- `PORT`: Application port (default: 12005)
- `ANTHROPIC_API_KEY`: For Anthropic Claude models in MCP playground
- `OPENAI_API_KEY`: For OpenAI models in MCP playground

## Development Setup

1. Clone the repository
2. Install dependencies with `pnpm install`
3. Set up environment variables in `.env.local`
4. Run database migrations with `pnpm db:migrate`
5. Start the development server with `pnpm dev`

## Technical Constraints

1. **Resource Isolation**: MCP servers need proper isolation for security
2. **Performance**: Tool execution should be optimized for low latency
3. **Error Handling**: Robust error handling for MCP server failures
4. **Content Processing**: Handling complex object responses from MCP tools

## Future Technical Directions

1. **Container-Based Hosting**: Adding Docker/Kubernetes support for MCP server isolation
2. **Optimized Message Handling**: Improving processing of complex tool responses
3. **TypeScript Types for Tools**: Enhanced type safety for MCP tool interfaces
4. **Enhanced Agent Capabilities**: Adding more advanced LangChain agent configurations 