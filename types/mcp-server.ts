import { McpServerSource, McpServerStatus, McpServerType } from '@/db/schema';

export interface McpServer {
  uuid: string;
  name: string;
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
  
  // Additional properties for shared servers
  originalServerUuid?: string;
  sharedBy?: string;
  customInstructions?: any[] | string | any;
  averageRating?: number;
  ratingCount?: number;
  installationCount?: number;

  // Flag to indicate if firejail sandboxing should be applied (used internally)
  applySandboxing?: boolean;
}
