CREATE TABLE "document_chunks" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_uuid" uuid NOT NULL,
	"project_uuid" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"zvec_vector_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_uuid_docs_uuid_fk" FOREIGN KEY ("document_uuid") REFERENCES "public"."docs"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_project_uuid_projects_uuid_fk" FOREIGN KEY ("project_uuid") REFERENCES "public"."projects"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_chunks_project_uuid_idx" ON "document_chunks" USING btree ("project_uuid");--> statement-breakpoint
CREATE INDEX "document_chunks_document_uuid_idx" ON "document_chunks" USING btree ("document_uuid");--> statement-breakpoint
CREATE INDEX "document_chunks_zvec_vector_id_idx" ON "document_chunks" USING btree ("zvec_vector_id");