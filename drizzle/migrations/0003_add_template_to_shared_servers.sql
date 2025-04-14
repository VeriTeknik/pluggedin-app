-- Add template field to shared_mcp_servers table
ALTER TABLE "shared_mcp_servers" 
ADD COLUMN "template" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Create an index on the template field for faster queries
CREATE INDEX "shared_mcp_servers_template_idx" ON "shared_mcp_servers" USING gin("template");

-- Add comment to explain the purpose of the field
COMMENT ON COLUMN "shared_mcp_servers"."template" IS 'Sanitized template of the original server with credentials removed'; 