-- Community Roadmap Feature Tables
-- Achievement-weighted voting system for feature requests

-- Enum for feature request status
DO $$ BEGIN
 CREATE TYPE "feature_request_status" AS ENUM('pending', 'accepted', 'declined', 'completed', 'in_progress');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Enum for feature request categories
DO $$ BEGIN
 CREATE TYPE "feature_request_category" AS ENUM(
  'mcp_servers',
  'ui_ux',
  'performance',
  'api',
  'social',
  'library',
  'analytics',
  'security',
  'mobile',
  'other'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Enum for vote type
DO $$ BEGIN
 CREATE TYPE "vote_type" AS ENUM('YES', 'NO');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Feature Requests Table
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
	"roadmap_priority" integer, -- 1-5 for accepted items (1 = highest)
	"votes_yes_count" integer DEFAULT 0 NOT NULL, -- Denormalized for performance
	"votes_no_count" integer DEFAULT 0 NOT NULL, -- Denormalized for performance
	"votes_yes_weight" integer DEFAULT 0 NOT NULL, -- Weighted vote total
	"votes_no_weight" integer DEFAULT 0 NOT NULL, -- Weighted vote total
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_requests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "feature_requests_accepted_by_admin_id_users_id_fk" FOREIGN KEY ("accepted_by_admin_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action
);

-- Feature Votes Table
CREATE TABLE IF NOT EXISTS "feature_votes" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_request_uuid" uuid NOT NULL,
	"user_id" text NOT NULL,
	"vote" "vote_type" NOT NULL,
	"vote_weight" integer NOT NULL, -- Calculated from user achievements
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_votes_feature_request_uuid_feature_requests_uuid_fk" FOREIGN KEY ("feature_request_uuid") REFERENCES "feature_requests"("uuid") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "feature_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "feature_votes_unique_user_feature" UNIQUE("feature_request_uuid", "user_id")
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "feature_requests_status_idx" ON "feature_requests" ("status");
CREATE INDEX IF NOT EXISTS "feature_requests_created_by_idx" ON "feature_requests" ("created_by_user_id");
CREATE INDEX IF NOT EXISTS "feature_requests_category_idx" ON "feature_requests" ("category");
CREATE INDEX IF NOT EXISTS "feature_requests_created_at_idx" ON "feature_requests" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "feature_requests_status_created_idx" ON "feature_requests" ("status", "created_at" DESC);

-- Composite index for admin queue (pending features, sorted by vote weight)
CREATE INDEX IF NOT EXISTS "feature_requests_pending_votes_idx" ON "feature_requests" ("status", "votes_yes_weight" DESC) WHERE status = 'pending';

-- Composite index for accepted features on roadmap
CREATE INDEX IF NOT EXISTS "feature_requests_roadmap_idx" ON "feature_requests" ("status", "roadmap_priority") WHERE status IN ('accepted', 'in_progress', 'completed');

CREATE INDEX IF NOT EXISTS "feature_votes_feature_idx" ON "feature_votes" ("feature_request_uuid");
CREATE INDEX IF NOT EXISTS "feature_votes_user_idx" ON "feature_votes" ("user_id");
CREATE INDEX IF NOT EXISTS "feature_votes_created_at_idx" ON "feature_votes" ("created_at" DESC);

-- Function to update feature request updated_at timestamp
CREATE OR REPLACE FUNCTION update_feature_request_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at timestamp
DROP TRIGGER IF EXISTS feature_request_updated_at_trigger ON feature_requests;
CREATE TRIGGER feature_request_updated_at_trigger
    BEFORE UPDATE ON feature_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_feature_request_timestamp();

-- Trigger for feature_votes updated_at
DROP TRIGGER IF EXISTS feature_vote_updated_at_trigger ON feature_votes;
CREATE TRIGGER feature_vote_updated_at_trigger
    BEFORE UPDATE ON feature_votes
    FOR EACH ROW
    EXECUTE FUNCTION update_feature_request_timestamp();

-- Comments for documentation
COMMENT ON TABLE feature_requests IS 'Community feature requests with achievement-weighted voting';
COMMENT ON TABLE feature_votes IS 'User votes on feature requests with calculated weight based on achievements';
COMMENT ON COLUMN feature_votes.vote_weight IS 'Weight calculated from user achievements: 1 (base) + number of achievements unlocked';
COMMENT ON COLUMN feature_requests.votes_yes_weight IS 'Sum of all YES vote weights (denormalized for performance)';
COMMENT ON COLUMN feature_requests.votes_no_weight IS 'Sum of all NO vote weights (denormalized for performance)';
