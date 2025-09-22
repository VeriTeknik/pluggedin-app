CREATE TABLE IF NOT EXISTS "user_ratings" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"server_id" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_server_idx" ON "user_ratings" USING btree ("user_id","server_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_idx" ON "user_ratings" USING btree ("server_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_idx" ON "user_ratings" USING btree ("user_id");