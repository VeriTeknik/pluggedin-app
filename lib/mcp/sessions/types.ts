export interface MpcSession {
  id: string;
  server_uuid: string;
  profile_uuid: string;
  session_data: Record<string, any>;
  last_activity: Date;
  expires_at: Date;
  created_at: Date;
}

export interface SessionStore {
  create(serverUuid: string, profileUuid: string, ttlMs?: number, specificId?: string): Promise<string>;
  get(sessionId: string): Promise<MpcSession | null>;
  update(sessionId: string, data: Partial<MpcSession>): Promise<void>;
  delete(sessionId: string): Promise<void>;
  deleteByServer(serverUuid: string): Promise<void>;
  cleanupExpired(): Promise<number>;
  getByServerAndProfile(serverUuid: string, profileUuid: string): Promise<MpcSession[]>;
}

export interface SessionManagerOptions {
  defaultTtlMs?: number;
  cleanupIntervalMs?: number;
  maxSessionsPerServer?: number;
}