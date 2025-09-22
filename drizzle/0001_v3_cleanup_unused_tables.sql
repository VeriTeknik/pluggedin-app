-- V3.0 Cleanup Migration
-- Drops unused tables that were removed from the schema
-- These tables existed in previous versions but are no longer used

-- Drop unused tables from schema.ts
DROP TABLE IF EXISTS "system_logs" CASCADE;
DROP TABLE IF EXISTS "log_retention_policies" CASCADE;

-- Drop other unused tables that might exist in the database
-- These were found in the database but not used in the codebase
DROP TABLE IF EXISTS "notification_settings" CASCADE;
DROP TABLE IF EXISTS "log_settings" CASCADE;
DROP TABLE IF EXISTS "syslog_settings" CASCADE;
DROP TABLE IF EXISTS "user_server_favorites" CASCADE;
DROP TABLE IF EXISTS "secure_unsubscribe_tokens" CASCADE;

-- Clean up any orphaned sequences
DROP SEQUENCE IF EXISTS system_logs_id_seq CASCADE;
DROP SEQUENCE IF EXISTS log_retention_policies_id_seq CASCADE;
DROP SEQUENCE IF EXISTS notification_settings_id_seq CASCADE;
DROP SEQUENCE IF EXISTS log_settings_id_seq CASCADE;
DROP SEQUENCE IF EXISTS syslog_settings_id_seq CASCADE;
DROP SEQUENCE IF EXISTS user_server_favorites_id_seq CASCADE;
DROP SEQUENCE IF EXISTS secure_unsubscribe_tokens_id_seq CASCADE;