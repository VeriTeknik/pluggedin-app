-- Create docs table with RAG support
-- This migration creates the docs table with project_uuid (for Hub-scoped RAG) and rag_document_id (for tracking RAG API documents)

CREATE TABLE "docs" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"project_uuid" uuid,
	"name" text NOT NULL,
	"description" text,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"file_path" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[],
	"rag_document_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "playground_settings" ADD COLUMN "rag_enabled" boolean DEFAULT false NOT NULL;

ALTER TABLE "docs" ADD CONSTRAINT "docs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "docs" ADD CONSTRAINT "docs_project_uuid_projects_uuid_fk" FOREIGN KEY ("project_uuid") REFERENCES "public"."projects"("uuid") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "docs_user_id_idx" ON "docs" USING btree ("user_id");

CREATE INDEX "docs_project_uuid_idx" ON "docs" USING btree ("project_uuid");

CREATE INDEX "docs_name_idx" ON "docs" USING btree ("name");

CREATE INDEX "docs_created_at_idx" ON "docs" USING btree ("created_at"); 