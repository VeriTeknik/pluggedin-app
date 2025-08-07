CREATE TABLE "token_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_uuid" uuid,
	"embedded_chat_uuid" uuid,
	"conversation_uuid" uuid,
	"message_id" integer,
	"provider" varchar(50) NOT NULL,
	"model" varchar(100) NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"prompt_cost" integer DEFAULT 0,
	"completion_cost" integer DEFAULT 0,
	"total_cost" integer DEFAULT 0,
	"context_type" varchar(20) DEFAULT 'playground' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_embedded_chat_uuid_embedded_chats_uuid_fk" FOREIGN KEY ("embedded_chat_uuid") REFERENCES "public"."embedded_chats"("uuid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_conversation_uuid_chat_conversations_uuid_fk" FOREIGN KEY ("conversation_uuid") REFERENCES "public"."chat_conversations"("uuid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_token_usage_profile" ON "token_usage" USING btree ("profile_uuid","created_at");--> statement-breakpoint
CREATE INDEX "idx_token_usage_chat" ON "token_usage" USING btree ("embedded_chat_uuid","created_at");--> statement-breakpoint
CREATE INDEX "idx_token_usage_conversation" ON "token_usage" USING btree ("conversation_uuid");--> statement-breakpoint
CREATE INDEX "idx_token_usage_provider" ON "token_usage" USING btree ("provider","model","created_at");