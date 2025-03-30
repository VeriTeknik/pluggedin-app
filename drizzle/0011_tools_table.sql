CREATE TYPE "tool_status" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE IF NOT EXISTS "tools" (
    "uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" text NOT NULL,
    "description" text,
    "tool_schema" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "mcp_server_uuid" uuid NOT NULL REFERENCES "mcp_servers"("uuid") ON DELETE CASCADE,
    "status" tool_status NOT NULL DEFAULT 'ACTIVE',
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "tools_mcp_server_uuid_idx" ON "tools" ("mcp_server_uuid");
CREATE INDEX "tools_status_idx" ON "tools" ("status");
CREATE UNIQUE INDEX "tools_mcp_server_name_idx" ON "tools" ("mcp_server_uuid", "name");
