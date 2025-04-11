import { Profile } from './profile';
import { McpServer } from './mcp-server';

export interface Follower {
  uuid: string;
  follower_profile_uuid: string;
  followed_profile_uuid: string;
  created_at: Date;
  follower_profile?: {
    username: string | null;
    name: string;
  };
  followed_profile?: {
    username: string | null;
    name: string;
  };
}

export interface SharedMcpServer {
  uuid: string;
  profile_uuid: string;
  server_uuid: string;
  title: string;
  description: string | null;
  is_public: boolean;
  template: any;
  created_at: Date;
  updated_at: Date;
  server?: McpServer;
  profile_username?: string | null;
}

export interface SharedCollection {
  uuid: string;
  profile_uuid: string;
  title: string;
  description: string | null;
  content: any;
  is_public: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface EmbeddedChat {
  uuid: string;
  profile_uuid: string;
  title: string;
  description: string | null;
  settings: any;
  is_public: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UsernameAvailability {
  available: boolean;
  message?: string;
} 