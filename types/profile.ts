import { Locale } from '@/i18n/config';

export interface Profile {
  uuid: string;
  name: string;
  created_at: Date;
  project_uuid: string;
  language: Locale | null;
}
