CREATE TABLE IF NOT EXISTS "release_notes" (
  "id" serial PRIMARY KEY,
  "repository" text NOT NULL,
  "version" text NOT NULL,
  "release_date" timestamp with time zone NOT NULL,
  "content" jsonb NOT NULL,
  "commit_sha" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE INDEX "release_notes_repository_idx" ON "release_notes" USING btree ("repository");
--> statement-breakpoint
CREATE INDEX "release_notes_version_idx" ON "release_notes" USING btree ("version");
--> statement-breakpoint
CREATE INDEX "release_notes_release_date_idx" ON "release_notes" USING btree ("release_date");
--> statement-breakpoint
CREATE UNIQUE INDEX "release_notes_repository_version_idx" ON "release_notes" USING btree ("repository", "version"); 