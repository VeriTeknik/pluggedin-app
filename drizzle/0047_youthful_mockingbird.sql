CREATE TABLE "document_model_attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"model_name" text NOT NULL,
	"model_provider" text NOT NULL,
	"contribution_type" text NOT NULL,
	"contribution_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"contribution_metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"content" text NOT NULL,
	"content_diff" jsonb,
	"created_by_model" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"change_summary" text
);
--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "profile_uuid" uuid;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "source" text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "ai_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "parent_document_id" uuid;--> statement-breakpoint
ALTER TABLE "document_model_attributions" ADD CONSTRAINT "document_model_attributions_document_id_docs_uuid_fk" FOREIGN KEY ("document_id") REFERENCES "public"."docs"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_docs_uuid_fk" FOREIGN KEY ("document_id") REFERENCES "public"."docs"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_model_attributions_document_id_idx" ON "document_model_attributions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_model_attributions_model_idx" ON "document_model_attributions" USING btree ("model_name","model_provider");--> statement-breakpoint
CREATE INDEX "document_model_attributions_timestamp_idx" ON "document_model_attributions" USING btree ("contribution_timestamp");--> statement-breakpoint
CREATE INDEX "document_versions_document_id_idx" ON "document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_versions_composite_idx" ON "document_versions" USING btree ("document_id","version_number");--> statement-breakpoint
ALTER TABLE "docs" ADD CONSTRAINT "docs_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "docs_profile_uuid_idx" ON "docs" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "docs_source_idx" ON "docs" USING btree ("source");--> statement-breakpoint
CREATE INDEX "docs_visibility_idx" ON "docs" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "docs_content_hash_idx" ON "docs" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "docs_parent_document_id_idx" ON "docs" USING btree ("parent_document_id");