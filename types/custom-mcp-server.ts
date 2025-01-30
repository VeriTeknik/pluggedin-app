import { McpServerStatus } from '@/db/schema';

export interface CustomMcpServer {
  uuid: string;
  name: string;
  created_at: Date;
  description: string | null;
  code_uuid: string;
  codeFileName: string | null;
  code: string | null;
  additionalArgs: string[];
  env: {
    [key: string]: string;
  };
  profile_uuid: string;
  status: McpServerStatus;
}

export type CreateCustomMcpServerData = {
  name: string;
  description?: string;
  code_uuid: string;
  additionalArgs?: string[];
  env?: { [key: string]: string };
};

export type UpdateCustomMcpServerData = Partial<CreateCustomMcpServerData>;
