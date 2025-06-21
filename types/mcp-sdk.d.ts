// Type declarations for MCP SDK Streamable HTTP transport
// This helps resolve import issues with the langchain-mcp-tools package

declare module '@modelcontextprotocol/sdk/client/streamableHttp.js' {
  export { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
  export type { StreamableHTTPClientTransportOptions } from '@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
}