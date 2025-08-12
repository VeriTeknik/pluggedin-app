CREATE TABLE "conversation_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '',
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"due_date" timestamp with time zone,
	"memory_id" uuid,
	"status" varchar(20) DEFAULT 'todo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation" varchar(50) NOT NULL,
	"error_type" varchar(50) NOT NULL,
	"error_message" text NOT NULL,
	"stack_trace" text,
	"conversation_id" uuid,
	"user_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"resolved" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "conversation_tasks" ADD CONSTRAINT "conversation_tasks_conversation_id_chat_conversations_uuid_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_tasks" ADD CONSTRAINT "conversation_tasks_memory_id_conversation_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."conversation_memories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_errors" ADD CONSTRAINT "memory_errors_conversation_id_chat_conversations_uuid_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("uuid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_errors" ADD CONSTRAINT "memory_errors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_conversation_tasks_conversation" ON "conversation_tasks" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_conversation_tasks_status" ON "conversation_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_conversation_tasks_priority" ON "conversation_tasks" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_conversation_tasks_due_date" ON "conversation_tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_conversation_tasks_memory" ON "conversation_tasks" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "idx_memory_errors_operation" ON "memory_errors" USING btree ("operation");--> statement-breakpoint
CREATE INDEX "idx_memory_errors_type" ON "memory_errors" USING btree ("error_type");--> statement-breakpoint
CREATE INDEX "idx_memory_errors_conversation" ON "memory_errors" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_memory_errors_user" ON "memory_errors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_memory_errors_resolved" ON "memory_errors" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX "idx_memory_errors_created" ON "memory_errors" USING btree ("created_at");