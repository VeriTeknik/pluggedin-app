ALTER TABLE "embedded_chats" ADD COLUMN "bot_avatar_url" text;--> statement-breakpoint
ALTER TABLE "embedded_chats" ADD COLUMN "expose_capabilities" boolean DEFAULT false;