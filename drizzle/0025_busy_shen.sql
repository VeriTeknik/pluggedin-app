CREATE TABLE IF NOT EXISTS "release_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"repository" text NOT NULL,
	"version" text NOT NULL,
	"release_date" timestamp with time zone NOT NULL,
	"content" jsonb NOT NULL,
	"commit_sha" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
