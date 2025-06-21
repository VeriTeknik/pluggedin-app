// Temporary workaround for StreamableHTTPClientTransport import issue
// This file re-exports the transport from the correct path

export { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
export type { StreamableHTTPClientTransportOptions } from '@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';