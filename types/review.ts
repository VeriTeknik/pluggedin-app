import { users } from '@/db/schema';

// Infer the User type from the Drizzle schema
type User = typeof users.$inferSelect;

export interface ServerReview {
  uuid: string;
  server_source: string; // e.g., 'COMMUNITY', 'NPM'
  server_external_id: string; // The ID within that source
  user_id: string;
  rating: number; // e.g., 1-5
  comment: string | null;
  created_at: Date;
  updated_at: Date;
  user?: Partial<User>; // Optional: Include user details like name, username, avatar
}
