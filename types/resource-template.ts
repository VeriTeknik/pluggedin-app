// Type definition based on db/schema.ts resourceTemplatesTable

export interface ResourceTemplate {
  uuid: string;
  mcp_server_uuid: string;
  uri_template: string;
  name: string | null;
  description: string | null;
  mime_type: string | null;
  template_variables: string[]; // Array of extracted variable names
  created_at: Date;
}
