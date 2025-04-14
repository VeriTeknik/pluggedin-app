import { Locale } from '@/i18n/config';

export interface Profile {
  uuid: string;
  name: string;
  created_at: Date;
  project_uuid: string;
  language: Locale | null; // Language might still be profile-specific? Re-check schema.ts if needed. Let's keep it for now based on schema.ts edit.
  // Removed user-specific social fields
}
