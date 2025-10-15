DO $$ BEGIN
  CREATE TYPE "public"."feature_request_category" AS ENUM('mcp_servers', 'ui_ux', 'performance', 'api', 'social', 'library', 'analytics', 'security', 'mobile', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."feature_request_status" AS ENUM('pending', 'accepted', 'declined', 'completed', 'in_progress');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."vote_type" AS ENUM('YES', 'NO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_requests" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" "feature_request_category" DEFAULT 'other' NOT NULL,
	"status" "feature_request_status" DEFAULT 'pending' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_admin_id" text,
	"declined_at" timestamp with time zone,
	"declined_reason" text,
	"roadmap_priority" integer,
	"votes_yes_count" integer DEFAULT 0 NOT NULL,
	"votes_no_count" integer DEFAULT 0 NOT NULL,
	"votes_yes_weight" integer DEFAULT 0 NOT NULL,
	"votes_no_weight" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_votes" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_request_uuid" uuid NOT NULL,
	"user_id" text NOT NULL,
	"vote" "vote_type" NOT NULL,
	"vote_weight" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_votes_unique_user_feature" UNIQUE("feature_request_uuid","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_accepted_by_admin_id_users_id_fk" FOREIGN KEY ("accepted_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "feature_votes" ADD CONSTRAINT "feature_votes_feature_request_uuid_feature_requests_uuid_fk" FOREIGN KEY ("feature_request_uuid") REFERENCES "public"."feature_requests"("uuid") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "feature_votes" ADD CONSTRAINT "feature_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_requests_status_idx" ON "feature_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_requests_created_by_idx" ON "feature_requests" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_requests_category_idx" ON "feature_requests" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_requests_created_at_idx" ON "feature_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_requests_status_created_idx" ON "feature_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_requests_pending_votes_idx" ON "feature_requests" USING btree ("status","votes_yes_weight") WHERE "feature_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_requests_roadmap_idx" ON "feature_requests" USING btree ("status","roadmap_priority") WHERE "feature_requests"."status" IN ('accepted', 'in_progress', 'completed');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_votes_feature_idx" ON "feature_votes" USING btree ("feature_request_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_votes_user_idx" ON "feature_votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_votes_created_at_idx" ON "feature_votes" USING btree ("created_at");--> statement-breakpoint

-- PostgreSQL triggers for automatic vote count updates
CREATE OR REPLACE FUNCTION refresh_feature_vote_stats()
RETURNS TRIGGER AS $$
DECLARE
  feature_uuid UUID;
  yes_count INTEGER;
  no_count INTEGER;
  yes_weight INTEGER;
  no_weight INTEGER;
BEGIN
  -- Determine which feature request to update
  IF (TG_OP = 'DELETE') THEN
    feature_uuid := OLD.feature_request_uuid;
  ELSE
    feature_uuid := NEW.feature_request_uuid;
  END IF;

  -- Calculate aggregated vote statistics
  SELECT
    COUNT(*) FILTER (WHERE vote = 'YES'),
    COUNT(*) FILTER (WHERE vote = 'NO'),
    COALESCE(SUM(vote_weight) FILTER (WHERE vote = 'YES'), 0),
    COALESCE(SUM(vote_weight) FILTER (WHERE vote = 'NO'), 0)
  INTO yes_count, no_count, yes_weight, no_weight
  FROM "feature_votes"
  WHERE feature_request_uuid = feature_uuid;

  -- Update feature_requests table
  UPDATE "feature_requests"
  SET
    votes_yes_count = yes_count,
    votes_no_count = no_count,
    votes_yes_weight = yes_weight,
    votes_no_weight = no_weight,
    updated_at = NOW()
  WHERE uuid = feature_uuid;

  -- Return appropriate record
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS trigger_feature_vote_insert ON "feature_votes";
CREATE TRIGGER trigger_feature_vote_insert
  AFTER INSERT ON "feature_votes"
  FOR EACH ROW
  EXECUTE FUNCTION refresh_feature_vote_stats();--> statement-breakpoint

DROP TRIGGER IF EXISTS trigger_feature_vote_update ON "feature_votes";
CREATE TRIGGER trigger_feature_vote_update
  AFTER UPDATE ON "feature_votes"
  FOR EACH ROW
  WHEN (OLD.vote IS DISTINCT FROM NEW.vote OR OLD.vote_weight IS DISTINCT FROM NEW.vote_weight)
  EXECUTE FUNCTION refresh_feature_vote_stats();--> statement-breakpoint

DROP TRIGGER IF EXISTS trigger_feature_vote_delete ON "feature_votes";
CREATE TRIGGER trigger_feature_vote_delete
  AFTER DELETE ON "feature_votes"
  FOR EACH ROW
  EXECUTE FUNCTION refresh_feature_vote_stats();