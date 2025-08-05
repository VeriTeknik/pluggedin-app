export interface Project {
  uuid: string;
  name: string;
  created_at: Date;
  active_profile_uuid: string | null;
  embedded_chat_enabled: boolean;
  embedded_chat_uuid: string | null;
}
