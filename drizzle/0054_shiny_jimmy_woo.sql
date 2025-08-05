ALTER TABLE "chat_conversations" ADD COLUMN "authenticated_user_id" text;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "authenticated_user_name" text;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "authenticated_user_avatar" text;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_authenticated_user_id_users_id_fk" FOREIGN KEY ("authenticated_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_conversations_authenticated_user" ON "chat_conversations" USING btree ("authenticated_user_id");