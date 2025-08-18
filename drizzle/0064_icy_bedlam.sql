ALTER TABLE "workflow_tasks" ALTER COLUMN "prerequisites" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "workflow_tasks" ALTER COLUMN "prerequisites" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "workflow_dependencies" DROP COLUMN "condition";