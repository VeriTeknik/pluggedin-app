import { McpServerSource, McpServerStatus, McpServerType } from '@/db/schema';

export interface McpServer {
  uuid: string;
  name: string;
  slug: string | null; // Added slug field for tool prefixing
  created_at: Date;
  description: string | null;
  command: string | null;
  args: string[] | null;
  env: {
    [key: string]: string;
  } | null;
  profile_uuid: string;
  status: McpServerStatus;
  type: McpServerType;
  url: string | null;
  source: McpServerSource;
  external_id: string | null;
  notes: string | null; // Added notes field
  config: Record<string, any> | null; // Added config field for storing metadata like requires_auth
  
  // Additional properties for shared servers
  originalServerUuid?: string;
  sharedBy?: string;
  customInstructions?: any[] | string | any;
  averageRating?: number;
  ratingCount?: number;
  installationCount?: number;

  // Every spawned process is sandboxed. false marks a server that cannot be;
  // like one with no sandbox available, it only starts when the operator has
  // set MCP_ALLOW_UNSANDBOXED_STDIO=true.
  applySandboxing?: boolean;

  // Streamable HTTP specific options
  transport?: 'streamable_http' | 'sse' | 'stdio';
  streamableHTTPOptions?: {
    sessionId?: string;
    authProvider?: any;
    headers?: Record<string, string>;
  };
}
