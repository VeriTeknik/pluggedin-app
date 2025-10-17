export interface ApiKey {
  uuid: string;

  // User ownership
  user_id?: string | null; // Nullable for orphaned keys

  // Project reference (nullable after project deletion)
  project_uuid?: string | null;
  project?: { // Related project if it still exists
    uuid: string;
    name: string;
  } | null;

  // Audit trail
  original_project_uuid?: string | null;

  api_key: string;
  name: string | null;
  description?: string | null;

  // Permissions
  all_projects_access: boolean;
  project_permissions?: string[] | null;

  // Status
  is_active: boolean;
  expires_at?: Date | string | null;

  // Timestamps
  created_at: Date | string;
  updated_at: Date | string;
  last_used_at?: Date | string | null;

  // Usage tracking
  usage_count: number;
  last_used_ip?: string | null;

  // Versioning
  version: number;

  // Relations
  user?: {
    id: string;
    email: string;
    username?: string | null;
  } | null;
}
