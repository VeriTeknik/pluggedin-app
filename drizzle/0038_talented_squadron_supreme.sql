DO $$ BEGIN
    ALTER TYPE "public"."mcp_server_source" ADD VALUE IF NOT EXISTS 'REGISTRY';
END $$;