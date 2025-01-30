import { McpServerStatus } from '@/db/schema';

export interface CustomMcpServer {
  uuid: string;
  name: string;
  created_at: Date;
  description: string | null;
  command: string;
  args: string[];
  env: {
    [key: string]: string;
  };
  profile_uuid: string;
  status: McpServerStatus;
}

export type CreateCustomMcpServerData = {
  name: string;
  description?: string;
  command: string;
  args?: string[];
  env?: { [key: string]: string };
};

export type UpdateCustomMcpServerData = Partial<CreateCustomMcpServerData>;
