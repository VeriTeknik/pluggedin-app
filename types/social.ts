import { Profile } from './profile';
import { McpServer } from './mcp-server';

export interface Follower {
  uuid: string;
  follower_profile_uuid: string;
  followed_profile_uuid: string;
  created_at: Date;
  follower?: Profile;
  followed?: Profile;
}

export interface SharedMcpServer {
  uuid: string;
  profile_uuid: string;
  server_uuid: string;
  title: string;
  description?: string;
  is_public: boolean;
  template?: any; // Sanitized template of the server with credentials removed
  created_at: Date;
  updated_at: Date;
  profile?: Profile;
  server?: McpServer;
}

export interface SharedCollection {
  uuid: string;
  profile_uuid: string;
  title: string;
  description?: string;
  content: any; // The collection data as JSON
  is_public: boolean;
  created_at: Date;
  updated_at: Date;
  profile?: Profile;
}

export interface EmbeddedChat {
  uuid: string;
  profile_uuid: string;
  title: string;
  description?: string;
  settings: Record<string, any>; // Chat settings as JSON
  is_public: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  profile?: Profile;
}

export interface UsernameAvailability {
  available: boolean;
  message?: string;
} 