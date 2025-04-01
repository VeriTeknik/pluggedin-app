// Basic type definition for a discovered tool stored in the database
export interface Tool {
  uuid: string;
  name: string;
  description: string | null;
  toolSchema: any; // Store as JSON object
  created_at: Date;
  mcp_server_uuid: string;
  status: 'ACTIVE' | 'INACTIVE';
}
