ALTER TABLE "embedded_chats" ADD COLUMN "description" text;--> statement-breakpoint
CREATE INDEX "idx_embedded_chats_slug" ON "embedded_chats" USING btree ("slug");