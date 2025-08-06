ALTER TABLE "chat_personas" ADD COLUMN "integrations" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "chat_personas" ADD COLUMN "capabilities" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "chat_personas" ADD COLUMN "tools_config" jsonb DEFAULT '{}'::jsonb;