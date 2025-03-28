ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT now();
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT now();

-- Only create auditLogsTable if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_logs') THEN
        CREATE TABLE IF NOT EXISTS "audit_logs" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            "profile_uuid" uuid REFERENCES "profiles"("uuid") ON DELETE cascade,
            "type" text NOT NULL,
            "action" text NOT NULL,
            "request_path" text,
            "request_method" text,
            "request_body" jsonb,
            "response_status" integer,
            "response_time_ms" integer,
            "user_agent" text,
            "ip_address" text,
            "server_uuid" uuid REFERENCES "mcp_servers"("uuid"),
            "created_at" timestamp with time zone NOT NULL DEFAULT now(),
            "metadata" jsonb
        );
    END IF;
END $$;

-- Only create notificationsTable if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notifications') THEN
        CREATE TABLE IF NOT EXISTS "notifications" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            "profile_uuid" uuid REFERENCES "profiles"("uuid") ON DELETE cascade,
            "type" text NOT NULL,
            "title" text NOT NULL,
            "message" text NOT NULL,
            "read" boolean DEFAULT false NOT NULL,
            "link" text,
            "created_at" timestamp with time zone NOT NULL DEFAULT now(),
            "expires_at" timestamp with time zone
        );
    END IF;
END $$;

-- Only create systemLogsTable if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'system_logs') THEN
        CREATE TABLE IF NOT EXISTS "system_logs" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            "level" text NOT NULL,
            "source" text NOT NULL,
            "message" text NOT NULL,
            "details" jsonb,
            "created_at" timestamp with time zone NOT NULL DEFAULT now()
        );
    END IF;
END $$;

-- Only create logRetentionPoliciesTable if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'log_retention_policies') THEN
        CREATE TABLE IF NOT EXISTS "log_retention_policies" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            "profile_uuid" uuid REFERENCES "profiles"("uuid") ON DELETE cascade,
            "retention_days" integer DEFAULT 7 NOT NULL,
            "max_log_size_mb" integer DEFAULT 100 NOT NULL,
            "is_active" boolean DEFAULT true NOT NULL,
            "created_at" timestamp with time zone NOT NULL DEFAULT now(),
            "updated_at" timestamp with time zone NOT NULL DEFAULT now()
        );
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS "audit_logs_profile_uuid_idx" ON "audit_logs" ("profile_uuid");
CREATE INDEX IF NOT EXISTS "audit_logs_type_idx" ON "audit_logs" ("type");
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "notifications_profile_uuid_idx" ON "notifications" ("profile_uuid");
CREATE INDEX IF NOT EXISTS "notifications_read_idx" ON "notifications" ("read");
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications" ("created_at");
CREATE INDEX IF NOT EXISTS "system_logs_level_idx" ON "system_logs" ("level");
CREATE INDEX IF NOT EXISTS "system_logs_source_idx" ON "system_logs" ("source");
CREATE INDEX IF NOT EXISTS "system_logs_created_at_idx" ON "system_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "log_retention_policies_profile_uuid_idx" ON "log_retention_policies" ("profile_uuid");