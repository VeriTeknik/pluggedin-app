// Removed unused Profile import
import { McpServer } from './mcp-server';

// Import User type if needed, or assume it's globally available/imported where used
// import { users } from '@/db/schema'; 
// type User = typeof users.$inferSelect;

export interface Follower { // Represents a row in the followersTable
  uuid: string;
  follower_user_id: string; // Changed from follower_profile_uuid
  followed_user_id: string; // Changed from followed_profile_uuid
  created_at: Date;
  // Optional: Include related user data if needed by components using this type
  // followerUser?: User; 
  // followedUser?: User;
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
  profile?: {
    project?: {
      user?: {
        id?: string;
        name?: string;
        username?: string;
      };
    };
  };
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
  profile?: {
    uuid: string;
    name: string;
    username: string;
    bio: string | null;
    is_public: boolean;
    avatar_url: string | null;
  };
}

export interface UsernameAvailability {
  available: boolean;
  message?: string;
}
