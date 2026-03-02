CREATE TABLE "device_auth_codes" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_code" varchar(64) NOT NULL,
	"user_code" varchar(12) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"api_key_uuid" uuid,
	"user_id" text,
	"project_uuid" uuid,
	"client_ip" varchar(45),
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	CONSTRAINT "device_auth_codes_device_code_unique" UNIQUE("device_code")
);
--> statement-breakpoint
ALTER TABLE "device_auth_codes" ADD CONSTRAINT "device_auth_codes_api_key_uuid_api_keys_uuid_fk" FOREIGN KEY ("api_key_uuid") REFERENCES "public"."api_keys"("uuid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_auth_codes" ADD CONSTRAINT "device_auth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_auth_codes" ADD CONSTRAINT "device_auth_codes_project_uuid_projects_uuid_fk" FOREIGN KEY ("project_uuid") REFERENCES "public"."projects"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_auth_device_code_idx" ON "device_auth_codes" USING btree ("device_code");--> statement-breakpoint
CREATE INDEX "device_auth_status_idx" ON "device_auth_codes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "device_auth_expires_at_idx" ON "device_auth_codes" USING btree ("expires_at");