DROP INDEX IF EXISTS "idx_tasks_conversation";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tasks_status";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tasks_priority";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tasks_due_date";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tasks_memory";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversation_tasks_conversation" ON "conversation_tasks" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversation_tasks_status" ON "conversation_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversation_tasks_priority" ON "conversation_tasks" USING btree ("priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversation_tasks_due_date" ON "conversation_tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversation_tasks_memory" ON "conversation_tasks" USING btree ("memory_id");