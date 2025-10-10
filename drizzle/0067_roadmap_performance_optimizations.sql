-- Migration: Add performance index and automatic vote count triggers for roadmap feature
-- Date: 2025-10-09
-- Description:
--   1. Add covering index on feature_votes for optimal vote aggregation performance
--   2. Add PostgreSQL triggers to automatically update vote counts in real-time

-- ===== PERFORMANCE INDEX =====
-- This covering index optimizes vote aggregation queries by including all columns needed
-- for filtering (feature_request_uuid, vote) and aggregation (vote_weight)
CREATE INDEX IF NOT EXISTS idx_feature_votes_aggregation
ON "feature_votes" ("feature_request_uuid", "vote", "vote_weight");

-- Remove legacy trigger/function from initial rollout (safe no-op if they never existed)
DROP TRIGGER IF EXISTS feature_vote_counts_trigger ON "feature_votes";
DROP FUNCTION IF EXISTS update_feature_vote_counts();

-- ===== AUTOMATIC VOTE COUNT TRIGGERS =====
-- These triggers automatically update denormalized vote counts in feature_requests table
-- whenever votes are inserted, updated, or deleted. This eliminates the need for manual
-- refreshFeatureVoteStats() calls and prevents race conditions.

-- Function to refresh vote statistics for a single feature request
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

  -- Calculate aggregated vote statistics using SQL
  SELECT
    COUNT(*) FILTER (WHERE vote = 'YES'),
    COUNT(*) FILTER (WHERE vote = 'NO'),
    COALESCE(SUM(vote_weight) FILTER (WHERE vote = 'YES'), 0),
    COALESCE(SUM(vote_weight) FILTER (WHERE vote = 'NO'), 0)
  INTO yes_count, no_count, yes_weight, no_weight
  FROM "feature_votes"
  WHERE feature_request_uuid = feature_uuid;

  -- Update feature_requests table with aggregated statistics
  UPDATE "feature_requests"
  SET
    votes_yes_count = yes_count,
    votes_no_count = no_count,
    votes_yes_weight = yes_weight,
    votes_no_weight = no_weight,
    updated_at = NOW()
  WHERE uuid = feature_uuid;

  -- Return appropriate record based on operation
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger for INSERT operations on feature_votes
DROP TRIGGER IF EXISTS trigger_feature_vote_insert ON "feature_votes";
CREATE TRIGGER trigger_feature_vote_insert
  AFTER INSERT ON "feature_votes"
  FOR EACH ROW
  EXECUTE FUNCTION refresh_feature_vote_stats();

-- Trigger for UPDATE operations on feature_votes
DROP TRIGGER IF EXISTS trigger_feature_vote_update ON "feature_votes";
CREATE TRIGGER trigger_feature_vote_update
  AFTER UPDATE ON "feature_votes"
  FOR EACH ROW
  WHEN (OLD.vote IS DISTINCT FROM NEW.vote OR OLD.vote_weight IS DISTINCT FROM NEW.vote_weight)
  EXECUTE FUNCTION refresh_feature_vote_stats();

-- Trigger for DELETE operations on feature_votes
DROP TRIGGER IF EXISTS trigger_feature_vote_delete ON "feature_votes";
CREATE TRIGGER trigger_feature_vote_delete
  AFTER DELETE ON "feature_votes"
  FOR EACH ROW
  EXECUTE FUNCTION refresh_feature_vote_stats();

-- ===== COMMENTS =====
COMMENT ON INDEX idx_feature_votes_aggregation IS 'Covering index for optimal vote aggregation performance';
COMMENT ON FUNCTION refresh_feature_vote_stats() IS 'Automatically updates denormalized vote counts in feature_requests table';
COMMENT ON TRIGGER trigger_feature_vote_insert ON "feature_votes" IS 'Auto-update vote counts on INSERT';
COMMENT ON TRIGGER trigger_feature_vote_update ON "feature_votes" IS 'Auto-update vote counts on UPDATE';
COMMENT ON TRIGGER trigger_feature_vote_delete ON "feature_votes" IS 'Auto-update vote counts on DELETE';
