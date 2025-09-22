CREATE TABLE "registry_servers" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registry_id" text,
	"name" text NOT NULL,
	"github_owner" text NOT NULL,
	"github_repo" text NOT NULL,
	"repository_url" text NOT NULL,
	"description" text,
	"is_claimed" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"claimed_by_user_id" text,
	"claimed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registry_servers_registry_id_unique" UNIQUE("registry_id")
);
--> statement-breakpoint
CREATE TABLE "server_claim_requests" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_uuid" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"github_username" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "registry_servers" ADD CONSTRAINT "registry_servers_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_claim_requests" ADD CONSTRAINT "server_claim_requests_server_uuid_registry_servers_uuid_fk" FOREIGN KEY ("server_uuid") REFERENCES "public"."registry_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_claim_requests" ADD CONSTRAINT "server_claim_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "registry_servers_github_idx" ON "registry_servers" USING btree ("github_owner","github_repo");--> statement-breakpoint
CREATE INDEX "registry_servers_claimed_by_idx" ON "registry_servers" USING btree ("claimed_by_user_id");--> statement-breakpoint
CREATE INDEX "registry_servers_is_published_idx" ON "registry_servers" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "server_claim_requests_server_idx" ON "server_claim_requests" USING btree ("server_uuid");--> statement-breakpoint
CREATE INDEX "server_claim_requests_user_idx" ON "server_claim_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "server_claim_requests_status_idx" ON "server_claim_requests" USING btree ("status");