import { Locale } from '@/i18n/config';

export interface Profile {
  uuid: string;
  name: string;
  created_at: Date;
  project_uuid: string;
  language: Locale | null;
  username?: string | null;
  bio?: string | null;
  is_public?: boolean;
  avatar_url?: string | null;
}
