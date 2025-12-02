CREATE TABLE IF NOT EXISTS "clipboards" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"name" varchar(255),
	"idx" integer,
	"value" text NOT NULL,
	"content_type" varchar(256) DEFAULT 'text/plain' NOT NULL,
	"encoding" varchar(20) DEFAULT 'utf-8' NOT NULL,
	"size_bytes" integer NOT NULL,
	"visibility" varchar(20) DEFAULT 'private' NOT NULL,
	"created_by_tool" varchar(255),
	"created_by_model" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "clipboards_profile_name_unique_idx" UNIQUE("profile_uuid","name"),
	CONSTRAINT "clipboards_profile_idx_unique_idx" UNIQUE("profile_uuid","idx"),
	CONSTRAINT "clipboards_size_check" CHECK ("size_bytes" <= 262144)
);
--> statement-breakpoint
ALTER TABLE "clipboards" ADD CONSTRAINT "clipboards_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clipboards_profile_uuid_idx" ON "clipboards" USING btree ("profile_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clipboards_expires_at_idx" ON "clipboards" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clipboards_content_type_idx" ON "clipboards" USING btree ("content_type");