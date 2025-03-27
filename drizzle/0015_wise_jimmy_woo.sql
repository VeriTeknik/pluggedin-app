CREATE TABLE "server_installations" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_uuid" uuid,
	"external_id" text,
	"source" "mcp_server_source" NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_ratings" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_uuid" uuid,
	"external_id" text,
	"source" "mcp_server_source" NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "server_installations" ADD CONSTRAINT "server_installations_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_installations" ADD CONSTRAINT "server_installations_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_ratings" ADD CONSTRAINT "server_ratings_server_uuid_mcp_servers_uuid_fk" FOREIGN KEY ("server_uuid") REFERENCES "public"."mcp_servers"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_ratings" ADD CONSTRAINT "server_ratings_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "server_installations_server_uuid_idx" ON "server_installations" USING btree ("server_uuid");--> statement-breakpoint
CREATE INDEX "server_installations_external_id_source_idx" ON "server_installations" USING btree ("external_id","source");--> statement-breakpoint
CREATE INDEX "server_installations_profile_uuid_idx" ON "server_installations" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "server_ratings_server_uuid_idx" ON "server_ratings" USING btree ("server_uuid");--> statement-breakpoint
CREATE INDEX "server_ratings_external_id_source_idx" ON "server_ratings" USING btree ("external_id","source");--> statement-breakpoint
CREATE INDEX "server_ratings_profile_uuid_idx" ON "server_ratings" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX "server_ratings_unique_idx" ON "server_ratings" USING btree ("profile_uuid","server_uuid");--> statement-breakpoint
CREATE INDEX "server_ratings_unique_external_idx" ON "server_ratings" USING btree ("profile_uuid","external_id","source");