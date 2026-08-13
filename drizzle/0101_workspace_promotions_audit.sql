CREATE TABLE "workspace_promotions" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"action" text NOT NULL,
	"from_project_uuid" uuid NOT NULL,
	"to_project_uuid" uuid,
	"from_project_active_profile_uuid" uuid,
	"profile_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
