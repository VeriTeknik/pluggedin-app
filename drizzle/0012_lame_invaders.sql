CREATE TABLE IF NOT EXISTS "playground_settings" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_uuid" uuid NOT NULL,
	"provider" text DEFAULT 'anthropic' NOT NULL,
	"model" text DEFAULT 'claude-3-7-sonnet-20250219' NOT NULL,
	"temperature" integer DEFAULT 0 NOT NULL,
	"max_tokens" integer DEFAULT 1000 NOT NULL,
	"log_level" text DEFAULT 'info' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "playground_settings" ADD CONSTRAINT "playground_settings_profile_uuid_profiles_uuid_fk" FOREIGN KEY ("profile_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "playground_settings_profile_uuid_idx" ON "playground_settings" USING btree ("profile_uuid");
--> statement-breakpoint
-- Add constraints for valid values
ALTER TABLE "playground_settings" ADD CONSTRAINT "valid_provider" CHECK (provider IN ('anthropic', 'openai'));
ALTER TABLE "playground_settings" ADD CONSTRAINT "valid_log_level" CHECK (log_level IN ('error', 'warn', 'info', 'debug'));
ALTER TABLE "playground_settings" ADD CONSTRAINT "valid_temperature" CHECK (temperature >= 0 AND temperature <= 1);
ALTER TABLE "playground_settings" ADD CONSTRAINT "valid_max_tokens" CHECK (max_tokens >= 100 AND max_tokens <= 4000);

-- Add trigger for updating updated_at
CREATE OR REPLACE FUNCTION update_playground_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_playground_settings_updated_at
    BEFORE UPDATE ON playground_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_playground_settings_updated_at();