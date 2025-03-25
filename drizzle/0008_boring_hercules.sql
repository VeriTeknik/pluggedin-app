ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_project_uuid_projects_uuid_fk";
--> statement-breakpoint
ALTER TABLE "custom_mcp_servers" DROP CONSTRAINT "custom_mcp_servers_code_uuid_codes_uuid_fk";
--> statement-breakpoint
ALTER TABLE "custom_mcp_servers" DROP CONSTRAINT "custom_mcp_servers_profile_uuid_profiles_uuid_fk";
--> statement-breakpoint
ALTER TABLE "mcp_servers" DROP CONSTRAINT "mcp_servers_profile_uuid_profiles_uuid_fk";
--> statement-breakpoint
ALTER TABLE "profiles" DROP CONSTRAINT "profiles_project_uuid_projects_uuid_fk";
--> statement-breakpoint
ALTER TABLE "codes" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_uuid_projects_uuid_fk" FOREIGN KEY ("project_uuid") REFERENCES "public"."projects"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codes" ADD CONSTRAINT "codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_mcp_servers" ADD CONSTRAINT "custom_mcp_servers_code_uuid_codes_uuid_fk" FOREIGN KEY ("code_uuid") REFERENCES "public"."codes"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_mcp_servers" ADD CONSTRAINT "custom_mcp_servers_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_project_uuid_projects_uuid_fk" FOREIGN KEY ("project_uuid") REFERENCES "public"."projects"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codes_user_id_idx" ON "codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");