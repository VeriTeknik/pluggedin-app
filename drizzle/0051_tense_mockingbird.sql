CREATE TABLE IF NOT EXISTS "email_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email_type" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now(),
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"segment" text,
	"variant" text,
	"subject" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email_type" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"sent" boolean DEFAULT false,
	"sent_at" timestamp with time zone,
	"cancelled" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_email_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"welcome_emails" boolean DEFAULT true,
	"product_updates" boolean DEFAULT true,
	"marketing_emails" boolean DEFAULT false,
	"admin_notifications" boolean DEFAULT true,
	"notification_severity" text DEFAULT 'ALERT,CRITICAL',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "registry_servers" DROP CONSTRAINT "registry_servers_claimed_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "shared_mcp_servers" DROP CONSTRAINT "shared_mcp_servers_claimed_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "last_used" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_tracking" ADD CONSTRAINT "email_tracking_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_email_preferences" ADD CONSTRAINT "user_email_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_tracking_user_id" ON "email_tracking" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_tracking_email_type" ON "email_tracking" USING btree ("email_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_tracking_sent_at" ON "email_tracking" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_emails_scheduled_for" ON "scheduled_emails" USING btree ("scheduled_for") WHERE sent = false AND cancelled = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scheduled_emails_user_id" ON "scheduled_emails" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "registry_servers" ADD CONSTRAINT "registry_servers_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mcp_servers" ADD CONSTRAINT "shared_mcp_servers_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;