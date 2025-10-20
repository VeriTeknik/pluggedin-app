/**
 * API Key Types
 * Type definitions for API key management
 */

export interface ApiKey {
  uuid: string;
  api_key: string;
  name: string | null;
  project_uuid: string;
  created_at: string;
  last_used_at: string | null;
}

export interface ApiKeyWithHub extends ApiKey {
  project_name: string;
}

export interface ApiKeyCreateParams {
  projectUuid: string;
  name?: string;
}

export interface ApiKeyUpdateHubParams {
  apiKeyUuid: string;
  newProjectUuid: string;
}
