CREATE TABLE "conversation_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text,
	"value_jsonb" jsonb NOT NULL,
	"language_code" text,
	"salience" real DEFAULT 0 NOT NULL,
	"novelty_hash" text,
	"pii" boolean DEFAULT false NOT NULL,
	"consent" text DEFAULT 'implicit',
	"source" varchar(64) NOT NULL,
	"source_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ttl_days" integer DEFAULT 365
);
--> statement-breakpoint
CREATE TABLE "user_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"key" text,
	"value_jsonb" jsonb NOT NULL,
	"language_code" text,
	"salience" real DEFAULT 0 NOT NULL,
	"novelty_hash" text,
	"pii" boolean DEFAULT false NOT NULL,
	"consent" text DEFAULT 'implicit',
	"source" varchar(64) NOT NULL,
	"source_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ttl_days" integer DEFAULT 730,
	CONSTRAINT "unique_owner_key" UNIQUE("owner_id","key")
);
--> statement-breakpoint
ALTER TABLE "conversation_memories" ADD CONSTRAINT "conversation_memories_conversation_id_chat_conversations_uuid_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mem_conversation" ON "conversation_memories" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_mem_owner" ON "conversation_memories" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_mem_novelty_hash" ON "conversation_memories" USING btree ("novelty_hash");--> statement-breakpoint
CREATE INDEX "idx_mem_kind" ON "conversation_memories" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_mem_key" ON "conversation_memories" USING btree ("key");--> statement-breakpoint
CREATE INDEX "idx_user_mem_owner" ON "user_memories" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_user_mem_key" ON "user_memories" USING btree ("key");