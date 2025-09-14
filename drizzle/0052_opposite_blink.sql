-- Check if columns exist before adding them
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'mcp_servers'
                AND column_name = 'transport_encrypted') THEN
    ALTER TABLE "mcp_servers" ADD COLUMN "transport_encrypted" text;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'mcp_servers'
                AND column_name = 'streamable_http_options_encrypted') THEN
    ALTER TABLE "mcp_servers" ADD COLUMN "streamable_http_options_encrypted" text;
  END IF;
END $$;